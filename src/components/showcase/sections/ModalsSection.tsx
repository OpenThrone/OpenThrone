import { Button, Group, Stack, Text } from '@mantine/core';
import { useTranslation } from 'next-i18next';
import type { MouseEvent } from 'react';
import { useState } from 'react';

import ConfirmationModal, {
  type ConfirmationTone,
} from '@/components/ConfirmationModal';
import {
  GoldTransferModal,
  type TransferLimits,
} from '@/components/GoldTransferModal';
import { AvatarFramingEditor } from '@/components/profile/AvatarFramingEditor';
import {
  mockAction,
  MockClicks,
  ShowcaseSection,
  Specimen,
} from '@/components/showcase/Showcase';
import SpyMissionsModal from '@/components/spyMissionsModal';
import type { AvatarFraming } from '@/utils/avatarFraming';

type ConfirmationExample = 'destructive' | 'primary' | 'positive' | 'typed';

const CONFIRMATIONS: Record<
  ConfirmationExample,
  {
    button: string;
    title: string;
    message: string;
    confirmText: string;
    tone: ConfirmationTone;
    requiredText?: string;
  }
> = {
  destructive: {
    button: 'Untrain units',
    title: 'Untrain units',
    message: 'Untraining refunds 75% of the price; you lose 1,250 gold.',
    confirmText: 'Untrain',
    tone: 'destructive',
  },
  primary: {
    button: 'Send news email',
    title: 'Confirm',
    message: 'Publish this news post and queue email for 312 recipients?',
    confirmText: 'Send',
    tone: 'primary',
  },
  positive: {
    button: 'Accept appeal',
    title: 'Confirm appeal acceptance',
    message: 'Accepting this appeal lifts its active ban or suspension.',
    confirmText: 'Accept appeal',
    tone: 'positive',
  },
  typed: {
    button: 'Disband (type to confirm)',
    title: 'Disband alliance',
    message: 'This removes every member and empties the treasury.',
    confirmText: 'Disband',
    tone: 'destructive',
    requiredText: 'Silver Court',
  },
};

const CONFIRMATION_EXAMPLES = Object.keys(
  CONFIRMATIONS,
) as ConfirmationExample[];

/** A stored avatar path from the artwork bucket. */
const SAMPLE_PORTRAIT = '/assets/images/santee.webp';
const SAMPLE_FRAMING: AvatarFraming = { x: 50, y: 30, zoom: 1.2 };
const MOCK_TARGET_ID = 202;

/** Mock daily transfer limits: the player has the Coal Mine. */
const UNLOCKED_LIMITS: TransferLimits = {
  unlocked: true,
  sendPerDay: '250000',
  receivePerDay: '3000000',
  feePercent: 5,
  sentToday: '40000',
  receivedToday: '120000',
};

/** Mock daily transfer limits: gold transfers are still locked. */
const LOCKED_LIMITS: TransferLimits = {
  unlocked: false,
  sendPerDay: '0',
  receivePerDay: '0',
  feePercent: 5,
  sentToday: '0',
  receivedToday: '0',
};

const MOCK_TRANSFER_GOLD = BigInt(750000);

const LIVE_ONLY_MODALS = [
  'modal.tsx (attack): fetches the attack recommendation when opened.',
  'GoldRequestModal: submits real gold requests.',
  'NewMessageModal: live search and room creation; its shared dialog is shown in Chat & messaging with mock data.',
  'SessionModal: lists recruitment sessions as soon as it opens.',
];

export default function ModalsSection() {
  const { t } = useTranslation('battle');
  const { t: tSocial } = useTranslation('social');
  const [confirmation, setConfirmation] = useState<ConfirmationExample | null>(
    null,
  );
  const [framingOpen, setFramingOpen] = useState(false);
  const [spyOpen, setSpyOpen] = useState(false);
  const [transferState, setTransferState] = useState<
    'unlocked' | 'locked' | null
  >(null);

  // The spy dialog posts the mission from its send button; mock that one click.
  const spySendLabels = [
    t('spyMissions.intel.send'),
    t('spyMissions.infiltration.send'),
    t('spyMissions.assassination.send'),
  ];
  const guardSpySend = (event: MouseEvent<HTMLDivElement>) => {
    const label = (event.target as HTMLElement)
      .closest('button')
      ?.textContent?.trim();
    if (!label || !spySendLabels.includes(label)) return;
    event.preventDefault();
    event.stopPropagation();
    mockAction(`${label} (spy mission)`)();
  };

  const active = confirmation ? CONFIRMATIONS[confirmation] : null;

  return (
    <ShowcaseSection
      id="modals"
      title="Modals & dialogs"
      description="Self-contained dialogs, opened from local state. Confirm buttons run mock actions."
    >
      <Specimen
        name="ConfirmationModal"
        usedOn={[
          '/battle/training',
          '/userprofile/[id]',
          '/social/requests',
          '/alliances/[id]',
          '/home/settings',
          '/home/admin/*',
          '/home/moderation/*',
        ]}
        note="The one confirm dialog. The tone is required and follows the consequence: destructive (red) loses gold, data or access; primary is significant but recoverable; positive is constructive. requiredText adds a type-to-confirm gate (alliance ConfirmActionModal wraps it). Cancel is default; while busy, Escape, outside click and the X are disabled."
      >
        <Group gap="xs">
          {CONFIRMATION_EXAMPLES.map((example) => (
            <Button
              key={example}
              variant="default"
              size="xs"
              onClick={() => setConfirmation(example)}
            >
              {CONFIRMATIONS[example].button}
            </Button>
          ))}
        </Group>
        <ConfirmationModal
          isOpen={confirmation !== null}
          onClose={() => setConfirmation(null)}
          onConfirm={() => {
            mockAction(active?.confirmText ?? 'Confirm')();
            setConfirmation(null);
          }}
          title={active?.title ?? ''}
          message={active?.message ?? ''}
          confirmText={active?.confirmText}
          type={active?.tone ?? 'primary'}
          requiredText={active?.requiredText}
        />
      </Specimen>

      <Specimen
        name="AvatarFramingEditor"
        usedOn={['/home/profile']}
        note="Drag, wheel or arrow keys to frame the portrait in the race frame."
      >
        <Button
          variant="default"
          size="xs"
          onClick={() => setFramingOpen(true)}
        >
          Frame portrait
        </Button>
        <AvatarFramingEditor
          opened={framingOpen}
          onClose={() => setFramingOpen(false)}
          avatar={SAMPLE_PORTRAIT}
          race="ELF"
          initialFraming={SAMPLE_FRAMING}
          onSave={(framing) => {
            mockAction(
              `Save framing x ${framing.x.toFixed(0)}, y ${framing.y.toFixed(0)}, zoom ${framing.zoom.toFixed(1)}`,
            )();
            setFramingOpen(false);
          }}
        />
      </Specimen>

      <Specimen
        name="SpyMissionsModal"
        usedOn={['/userprofile/[id]', '/battle/results/[id]']}
        note="Opening it does not fetch; spy counts come from your own account. The send button is mocked."
      >
        <div onClickCapture={guardSpySend}>
          <Button variant="default" size="xs" onClick={() => setSpyOpen(true)}>
            Spy on Grukk the Vile
          </Button>
          <SpyMissionsModal
            isOpen={spyOpen}
            toggleModal={() => setSpyOpen((open) => !open)}
            defenderID={MOCK_TARGET_ID}
            targetName="Grukk the Vile"
          />
        </div>
      </Specimen>

      <Specimen
        name="GoldTransferModal"
        usedOn={['/userprofile/[id]']}
        wide
        note="Shows the daily allowance, the destroyed fee and the locked state. The limits are mock data (no request) and the send button is mocked."
      >
        <MockClicks labels={[tSocial('goldTransfer.submit')]}>
          <Group gap="xs">
            <Button
              variant="default"
              size="xs"
              onClick={() => setTransferState('unlocked')}
            >
              Transfer gold (unlocked)
            </Button>
            <Button
              variant="default"
              size="xs"
              onClick={() => setTransferState('locked')}
            >
              Transfer gold (locked)
            </Button>
          </Group>
          <GoldTransferModal
            isOpen={transferState !== null}
            onClose={() => setTransferState(null)}
            targetUserId={MOCK_TARGET_ID}
            targetUserName="Grukk the Vile"
            userGold={MOCK_TRANSFER_GOLD}
            onTransferComplete={() => mockAction('Transfer gold')()}
            limitsOverride={
              transferState === 'locked' ? LOCKED_LIMITS : UNLOCKED_LIMITS
            }
          />
        </MockClicks>
      </Specimen>

      <Specimen
        name="Live-only dialogs"
        note="These fetch or post live data, so they are shown only on real pages."
      >
        <Stack gap={4}>
          {LIVE_ONLY_MODALS.map((line) => (
            <Text key={line} size="sm" c="var(--ot-muted)">
              {line}
            </Text>
          ))}
        </Stack>
      </Specimen>
    </ShowcaseSection>
  );
}
