import { Button, Tooltip } from '@mantine/core';
import { useTranslation } from 'next-i18next';

interface ApproveRequestButtonProps {
  /** True when the request belongs to the viewer and they lack approve_own_requests. */
  blockedAsOwn: boolean;
  loading: boolean;
  disabled?: boolean;
  onApprove: () => void;
}

/**
 * Approve action for treasury queues. A manager without approve_own_requests
 * sees it disabled on their own request, with a tooltip saying why.
 */
export const ApproveRequestButton = ({
  blockedAsOwn,
  loading,
  disabled = false,
  onApprove,
}: ApproveRequestButtonProps) => {
  const { t } = useTranslation('allianceTreasury');

  if (blockedAsOwn) {
    // data-disabled keeps the button focusable so the tooltip still shows.
    return (
      <Tooltip label={t('approveOwnBlocked')} withArrow multiline maw={240}>
        <Button
          size="compact-xs"
          color="green"
          data-disabled
          aria-disabled
          onClick={(event) => event.preventDefault()}
        >
          {t('approve')}
        </Button>
      </Tooltip>
    );
  }

  return (
    <Button
      size="compact-xs"
      color="green"
      loading={loading}
      disabled={disabled}
      onClick={onApprove}
    >
      {t('approve')}
    </Button>
  );
};
