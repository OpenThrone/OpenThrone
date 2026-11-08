import { useState } from 'react';

import { ConfirmErasureView } from '@/components/account/ConfirmErasureView';
import { VeteranClaimView } from '@/components/account/VeteranClaimView';
import type {
  ErasureRow,
  ExportRow,
  PrivacyView,
} from '@/components/admin/PrivacyRequestsPanel';
import { PrivacyRequestsView } from '@/components/admin/PrivacyRequestsPanel';
import {
  PrivacyControlsView,
  PrivacyCredentialsForm,
} from '@/components/settings/PrivacyControls';
import {
  mockAction,
  ShowcaseSection,
  Specimen,
} from '@/components/showcase/Showcase';

const SOON = '2099-01-15T12:00:00Z';
const erasureRows: ErasureRow[] = [
  {
    id: 4,
    userId: 812,
    displayName: 'Example Commander',
    status: 'PENDING',
    requestedAt: '2099-01-01T09:00:00Z',
    confirmedAt: '2099-01-01T09:10:00Z',
    scheduledFor: SOON,
    completedAt: null,
    cancelledAt: null,
    cancelledBy: null,
    expeditedByUserId: null,
    attempts: 0,
    lastError: null,
  },
  {
    id: 3,
    userId: 640,
    displayName: 'Awaiting Mail',
    status: 'AWAITING_CONFIRMATION',
    requestedAt: '2099-01-02T09:00:00Z',
    confirmedAt: null,
    scheduledFor: null,
    completedAt: null,
    cancelledAt: null,
    cancelledBy: null,
    expeditedByUserId: null,
    attempts: 0,
    lastError: null,
  },
  {
    id: 2,
    userId: 511,
    displayName: 'Stuck Request',
    status: 'PENDING',
    requestedAt: '2098-12-01T09:00:00Z',
    confirmedAt: '2098-12-01T09:10:00Z',
    scheduledFor: '2098-12-15T09:10:00Z',
    completedAt: null,
    cancelledAt: null,
    cancelledBy: null,
    expeditedByUserId: null,
    attempts: 3,
    lastError: 'Staff accounts must be closed by an administrator',
  },
  {
    id: 1,
    userId: 301,
    displayName: 'deleted-user-example',
    status: 'COMPLETED',
    requestedAt: '2098-11-01T09:00:00Z',
    confirmedAt: '2098-11-01T09:10:00Z',
    scheduledFor: '2098-11-15T09:10:00Z',
    completedAt: '2098-11-15T10:00:00Z',
    cancelledAt: null,
    cancelledBy: null,
    expeditedByUserId: null,
    attempts: 0,
    lastError: null,
  },
];
const exportRows: ExportRow[] = [
  {
    id: 2,
    userId: 812,
    displayName: 'Example Commander',
    requestedAt: '2099-01-03T10:00:00Z',
    completedAt: '2099-01-03T10:00:02Z',
    byteSize: 183_000,
  },
];

function AdminSpecimen() {
  const [view, setView] = useState<PrivacyView>('erasure');
  return (
    <PrivacyRequestsView
      view={view}
      onViewChange={setView}
      erasures={erasureRows}
      exports={exportRows}
      page={1}
      totalPages={1}
      onPageChange={mockAction('change page')}
      loading={false}
      busy={false}
      error={null}
      notice={null}
      onAction={async () => {
        mockAction('staff action')();
        return true;
      }}
      onOpen={async () => {
        mockAction('open request')();
        return true;
      }}
    />
  );
}

/** Settings, confirmation page and admin surfaces for data export and erasure. */
export default function PrivacySection() {
  return (
    <ShowcaseSection
      id="privacy"
      title="Your data"
      description="Download my data, account-erasure request, its email confirmation page and the staff view. Mock data and mock actions only."
    >
      <Specimen
        name="Your data card"
        usedOn={['/home/settings']}
        framed={false}
        note="No request in progress."
      >
        <PrivacyControlsView
          erasure={{
            status: 'NONE',
            requestedAt: null,
            confirmationExpiresAt: null,
            scheduledFor: null,
          }}
          requiresTotp={false}
          busy={false}
          dialog={null}
          dialogError={null}
          exportNotice={null}
          onOpen={mockAction('open dialog')}
          onClose={mockAction('close dialog')}
          onExport={mockAction('download data')}
          onRequestErasure={mockAction('request erasure')}
          onWithdraw={mockAction('withdraw request')}
        />
      </Specimen>
      <Specimen
        name="Your data card, awaiting email confirmation"
        usedOn={['/home/settings']}
        framed={false}
        note="Download was refused because one already ran today."
      >
        <PrivacyControlsView
          erasure={{
            status: 'AWAITING_CONFIRMATION',
            requestedAt: '2099-01-01T09:00:00Z',
            confirmationExpiresAt: SOON,
            scheduledFor: null,
          }}
          requiresTotp
          busy={false}
          dialog={null}
          dialogError={null}
          exportNotice="You already downloaded your data today. You can download again after 1/16/2099, 12:00:00 PM."
          onOpen={mockAction('open dialog')}
          onClose={mockAction('close dialog')}
          onExport={mockAction('download data')}
          onRequestErasure={mockAction('request erasure')}
          onWithdraw={mockAction('withdraw request')}
        />
      </Specimen>
      <Specimen
        name="Re-authentication form: download"
        usedOn={['/home/settings']}
        note="Shown inside a dialog; password only when 2FA is off."
      >
        <PrivacyCredentialsForm
          requiresTotp={false}
          busy={false}
          error={null}
          submitLabel="Download"
          onSubmit={mockAction('download data')}
          onCancel={mockAction('cancel')}
        />
      </Specimen>
      <Specimen
        name="Re-authentication form: erasure with 2FA and an error"
        usedOn={['/home/settings']}
      >
        <PrivacyCredentialsForm
          requiresTotp
          withReason
          destructive
          busy={false}
          error="That password is not correct."
          submitLabel="Send confirmation email"
          onSubmit={mockAction('request erasure')}
          onCancel={mockAction('cancel')}
        />
      </Specimen>
      {(['ready', 'done', 'invalid'] as const).map((status) => (
        <Specimen
          key={status}
          name={`Deletion confirmation page: ${status}`}
          usedOn={['/account/confirm-erasure']}
        >
          <ConfirmErasureView
            status={status}
            scheduledFor={SOON}
            onConfirm={mockAction('confirm deletion')}
          />
        </Specimen>
      ))}
      {(['ready', 'invalid'] as const).map((status) => (
        <Specimen
          key={`notice-${status}`}
          name={`Deletion from an inactivity email: ${status}`}
          usedOn={['/account/confirm-erasure?notice=…']}
        >
          <ConfirmErasureView
            status={status}
            scheduledFor={SOON}
            fromNotice
            onConfirm={mockAction('confirm deletion')}
          />
        </Specimen>
      ))}
      {(
        [
          ['ready', null],
          ['ready', 'NAME_MISMATCH'],
          ['done', null],
          ['missing', null],
        ] as const
      ).map(([status, error]) => (
        <Specimen
          key={`${status}-${error}`}
          name={`Veteran claim page: ${status}${error ? ` (${error})` : ''}`}
          usedOn={['/account/veteran-claim']}
        >
          <VeteranClaimView
            status={status}
            error={error}
            displayName={error ? 'NotMyOldName' : ''}
            onDisplayNameChange={mockAction('type name')}
            onClaim={mockAction('claim legacy')}
            onResend={mockAction('send new link')}
            loginHref="#"
            result={{
              title: 'ERA1_TESTER',
              veteranSince: '2026-03-01T00:00:00.000Z',
              displayName: 'GoneCommander',
            }}
          />
        </Specimen>
      ))}
      <Specimen
        name="Privacy requests (staff)"
        usedOn={['/home/admin/privacy', 'Edit Player > Privacy']}
        wide
        framed={false}
        note="Cancel and Erase now need a written reason; both are audited."
      >
        <AdminSpecimen />
      </Specimen>
    </ShowcaseSection>
  );
}
