import { Box, Group, Stack, Text } from '@mantine/core';
import { useTranslation } from 'next-i18next';
import type { ReactNode } from 'react';

import RecruitmentFlowView from '@/components/RecruitmentFlowView';
import { formatResetTime } from '@/utils/recruitmentStatus';
import { getOTStartDate } from '@/utils/timefunctions';

import { mockAction, ShowcaseSection, Specimen } from '../Showcase';

const VISITOR = {
  display_name: 'Ravenhold',
  level: 42,
  race: 'HUMAN',
  class: 'FIGHTER',
};

const ALLOWANCE = {
  dailyCap: 25,
  perIpCap: 5,
  remaining: 18,
  perIpRemaining: 4,
};

/** Stand-in for the Cloudflare widget; the real one needs a site key. */
function CaptchaPlaceholder() {
  return (
    <Box
      aria-label="Cloudflare Turnstile challenge placeholder"
      style={{
        width: 300,
        border: '1px dashed var(--ot-muted)',
        borderRadius: 4,
        padding: '14px 16px',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
      }}
    >
      <Box
        aria-hidden
        style={{
          width: 20,
          height: 20,
          border: '2px solid var(--ot-muted)',
          borderRadius: 3,
        }}
      />
      <Text size="sm" c="var(--ot-muted)">
        Cloudflare Turnstile
      </Text>
    </Box>
  );
}

function FlowState({
  children,
  label,
}: {
  children: ReactNode;
  label: string;
}) {
  return (
    <Stack gap="sm" align="center" w="100%">
      <Text size="xs" c="var(--ot-muted)">
        {label}
      </Text>
      {children}
    </Stack>
  );
}

/** Recruit-link flow: external visits, internal claims and the sidebar widget. */
export default function RecruitmentSection() {
  const { t } = useTranslation('common');
  const submit = mockAction('Recruit 1 citizen');

  return (
    <ShowcaseSection
      id="recruitment"
      title="Recruiting"
      description="The recruit-link flow in both modes: external visits grant the link owner a citizen (capped per day and per connection), internal claims grant the signed-in player a citizen and gold. Eligibility, the challenge and rewards are live API calls, so every state below is seeded."
    >
      <Specimen
        name="External visit — ready"
        usedOn={['/recruit/[id]']}
        note="No account needed; the allowance line reads from the eligibility check."
      >
        <RecruitmentFlowView
          isExternal
          signedIn={false}
          submitting={false}
          error={null}
          succeeded={false}
          ready
          showCaptcha={false}
          allowance={ALLOWANCE}
          userInfo={VISITOR}
          formRef={{ current: null }}
          captchaSlot={null}
          onSubmit={submit}
          onRetry={mockAction('Try again')}
          onRegister={mockAction('Register')}
        />
      </Specimen>

      <Specimen
        name="External visit — verification pending"
        usedOn={['/recruit/[id]']}
        note="The challenge stays centered below the shield with its height reserved while loading. Solving submits automatically; expiry and errors return to a refusal."
      >
        <RecruitmentFlowView
          isExternal
          signedIn={false}
          submitting={false}
          error={null}
          succeeded={false}
          ready
          showCaptcha
          allowance={ALLOWANCE}
          userInfo={VISITOR}
          formRef={{ current: null }}
          captchaSlot={<CaptchaPlaceholder />}
          onSubmit={submit}
          onRetry={mockAction('Try again')}
          onRegister={mockAction('Register')}
        />
      </Specimen>

      <Specimen
        name="External visit — connection allowance used"
        usedOn={['/recruit/[id]']}
        note="Per-connection refusals never offer a retry; the visitor can still open other players' links."
      >
        <RecruitmentFlowView
          isExternal
          signedIn={false}
          submitting={false}
          error={t('recruit.ipCapReached')}
          succeeded={false}
          ready={false}
          showCaptcha={false}
          allowance={{}}
          userInfo={VISITOR}
          formRef={{ current: null }}
          captchaSlot={null}
          onSubmit={submit}
          onRetry={mockAction('Try again')}
          onRegister={mockAction('Register')}
        />
      </Specimen>

      <Specimen
        name="Internal claim — signed in"
        usedOn={['/recruit/[id]', 'userprofile recruit button']}
        note="The internal claim rewards the visitor with a citizen and 250 gold."
      >
        <RecruitmentFlowView
          isExternal={false}
          signedIn
          submitting={false}
          error={null}
          succeeded={false}
          ready
          showCaptcha={false}
          allowance={{}}
          userInfo={VISITOR}
          formRef={{ current: null }}
          captchaSlot={null}
          onSubmit={submit}
          onRetry={mockAction('Try again')}
          onRegister={mockAction('Register')}
        />
      </Specimen>

      <Specimen
        name="Internal claim — daily allowance used"
        usedOn={['/recruit/[id]']}
      >
        <RecruitmentFlowView
          isExternal={false}
          signedIn
          submitting={false}
          error={t('recruit.recruiterCapReached')}
          succeeded={false}
          ready={false}
          showCaptcha={false}
          allowance={{}}
          userInfo={VISITOR}
          formRef={{ current: null }}
          captchaSlot={null}
          onSubmit={submit}
          onRetry={mockAction('Try again')}
          onRegister={mockAction('Register')}
        />
      </Specimen>

      <Specimen
        name="External visit — success"
        usedOn={['/recruit/[id]']}
        note="After a success the visitor can claim again while the link owner has allowance left."
      >
        <RecruitmentFlowView
          isExternal
          signedIn={false}
          submitting={false}
          error={null}
          succeeded
          ready={false}
          showCaptcha={false}
          allowance={{}}
          userInfo={VISITOR}
          formRef={{ current: null }}
          captchaSlot={null}
          onSubmit={submit}
          onRetry={mockAction('Try again')}
          onRegister={mockAction('Register')}
        />
      </Specimen>

      <Specimen
        name="Sidebar recruit widget"
        usedOn={['sidebar PlayerActions']}
        wide
        note="Embedded next to a specific player: checking, ready, refused, and success with the daily counter."
      >
        <Group grow align="flex-start" gap="md">
          <FlowState label="Checking eligibility">
            <RecruitmentFlowView
              embedded
              isExternal={false}
              signedIn
              submitting={false}
              error={null}
              succeeded={false}
              ready={false}
              showCaptcha={false}
              allowance={{}}
              userInfo={null}
              targetName={VISITOR.display_name}
              pairProgress={null}
              formRef={{ current: null }}
              captchaSlot={null}
              onSubmit={submit}
              onRetry={mockAction('Try again')}
              onRegister={mockAction('Register')}
            />
          </FlowState>
          <FlowState label="Ready">
            <RecruitmentFlowView
              embedded
              isExternal={false}
              signedIn
              submitting={false}
              error={null}
              succeeded={false}
              ready
              showCaptcha={false}
              allowance={{}}
              userInfo={null}
              targetName={VISITOR.display_name}
              pairProgress={null}
              formRef={{ current: null }}
              captchaSlot={null}
              onSubmit={submit}
              onRetry={mockAction('Try again')}
              onRegister={mockAction('Register')}
            />
          </FlowState>
          <FlowState label="Refused">
            <RecruitmentFlowView
              embedded
              isExternal={false}
              signedIn
              submitting={false}
              error={t('recruit.pairLimitReached')}
              succeeded={false}
              ready={false}
              showCaptcha={false}
              allowance={{}}
              userInfo={null}
              targetName={VISITOR.display_name}
              pairProgress={null}
              formRef={{ current: null }}
              captchaSlot={null}
              onSubmit={submit}
              onRetry={mockAction('Try again')}
              onRegister={mockAction('Register')}
            />
          </FlowState>
          <FlowState label="Success with counter">
            <RecruitmentFlowView
              embedded
              isExternal={false}
              signedIn
              submitting={false}
              error={null}
              succeeded
              ready={false}
              showCaptcha={false}
              allowance={{}}
              userInfo={null}
              targetName={VISITOR.display_name}
              pairProgress={{
                name: VISITOR.display_name,
                used: 2,
                limit: 5,
                left: 3,
                resetsAt: formatResetTime(getOTStartDate(1).toISOString()),
              }}
              formRef={{ current: null }}
              captchaSlot={null}
              onSubmit={submit}
              onRetry={mockAction('Try again')}
              onRegister={mockAction('Register')}
            />
          </FlowState>
        </Group>
      </Specimen>
    </ShowcaseSection>
  );
}
