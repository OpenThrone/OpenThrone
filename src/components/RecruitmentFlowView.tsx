import {
  Button,
  Center,
  Divider,
  Group,
  Loader,
  Space,
  Text,
} from '@mantine/core';
import { useTranslation } from 'next-i18next';
import type { FormEvent, ReactNode, RefObject } from 'react';

import Image from '@/components/ArtworkImage';
import { GameCard } from '@/components/game/GameCard';
import type { PlayerRace } from '@/types/typings';
import { getAssetPath } from '@/utils/utilities';

/** External allowance numbers the eligibility endpoint reports for the visit. */
export interface RecruitmentFlowAllowance {
  dailyCap?: number;
  perIpCap?: number;
  remaining?: number;
  perIpRemaining?: number;
}

export interface RecruitmentFlowUserInfo {
  display_name: string;
  level: number;
  race: string;
  class: string;
}

/** Embedded success extras: today's counter for this link after a recruit. */
export interface RecruitmentFlowPairProgress {
  name: string;
  used: number;
  limit: number;
  left: number;
  resetsAt: string;
}

interface RecruitmentFlowViewProps {
  /** External visits reward the link owner; internal claims reward the signer. */
  isExternal: boolean;
  signedIn: boolean;
  embedded?: boolean;
  submitting: boolean;
  error: string | null;
  succeeded: boolean;
  ready: boolean;
  showCaptcha: boolean;
  allowance: RecruitmentFlowAllowance;
  userInfo: RecruitmentFlowUserInfo | null;
  targetName?: string;
  pairProgress?: RecruitmentFlowPairProgress | null;
  formRef: RefObject<HTMLFormElement | null>;
  /**
   * The live challenge widget (or a guide placeholder) rendered while the
   * captcha is pending; the view itself never talks to Turnstile.
   */
  captchaSlot?: ReactNode;
  onSubmit: (event?: FormEvent) => void;
  onRetry: () => void;
  onRegister: () => void;
}

/**
 * The recruitment flow's states, driven entirely by props so the showcase can
 * seed them: eligibility result, challenge, allowance, refusal and success.
 * RecruitmentFlow owns the API calls, session and captcha token.
 */
export default function RecruitmentFlowView({
  isExternal,
  signedIn,
  embedded = false,
  submitting,
  error,
  succeeded,
  ready,
  showCaptcha,
  allowance,
  userInfo,
  targetName,
  pairProgress,
  formRef,
  captchaSlot,
  onSubmit,
  onRetry,
  onRegister,
}: RecruitmentFlowViewProps) {
  const { t } = useTranslation('common');
  const introKey = isExternal
    ? 'recruit.forTheirKingdom'
    : signedIn
      ? 'recruit.forYourKingdom'
      : 'recruit.signInToRecruit';
  const intro = t(introKey, {
    name: userInfo?.display_name ?? targetName ?? '',
  });

  const stateBlock = succeeded ? (
    <>
      <Text role="status" {...(embedded ? { c: 'green.3' } : {})}>
        {embedded
          ? t('recruit.completed')
          : t(isExternal ? 'recruit.externalCompleted' : 'recruit.completed', {
              name: userInfo?.display_name ?? '',
            })}
      </Text>
      {embedded ? (
        pairProgress ? (
          <>
            <Text size="sm" mt="xs">
              {t('recruit.pairProgress', {
                name: pairProgress.name,
                used: pairProgress.used,
                limit: pairProgress.limit,
              })}
            </Text>
            <Text size="sm" c="dimmed" data-testid="recruits-left">
              {t('recruit.recruitsLeft', {
                count: pairProgress.left,
                time: pairProgress.resetsAt,
              })}
            </Text>
            {pairProgress.left > 0 && (
              <Button mt="md" onClick={onRetry}>
                {t('recruit.again')}
              </Button>
            )}
          </>
        ) : null
      ) : (
        <Button mt="md" onClick={onRetry}>
          {t('recruit.again')}
        </Button>
      )}
    </>
  ) : error ? (
    <>
      <Text role="alert" {...(embedded ? { mb: 'md' } : {})}>
        {error}
      </Text>
      {embedded && <Button onClick={onRetry}>{t('recruit.retry')}</Button>}
    </>
  ) : ready && !showCaptcha ? (
    <form
      ref={formRef}
      id={embedded ? undefined : 'recruitForm'}
      onSubmit={onSubmit}
    >
      <Button type="submit" loading={submitting}>
        {t('recruit.submit')}
      </Button>
    </form>
  ) : showCaptcha ? (
    <form
      ref={formRef}
      id={embedded ? undefined : 'recruitForm'}
      onSubmit={onSubmit}
    >
      <Center mih={65}>{captchaSlot}</Center>
    </form>
  ) : embedded ? (
    <Loader size="sm" aria-label={t('recruit.checkingEligibility')} />
  ) : null;

  if (embedded) {
    return (
      <div>
        {!succeeded && <Text mb="md">{intro}</Text>}
        {stateBlock}
      </div>
    );
  }

  return (
    <div>
      {userInfo && (
        <div className="mb-5 items-center text-center">
          <div>
            <Text size="xl">
              {t('recruit.linkFrom', { name: userInfo.display_name })}
            </Text>
            {!error && <Text mb="sm">{intro}</Text>}
            {t('recruit.level', { level: userInfo.level })}{' '}
            {t('recruit.race', { race: userInfo.race, class: userInfo.class })}.
            <Group justify="center" mt="md">
              <Image
                src={getAssetPath(
                  'shields',
                  '150x150',
                  userInfo.race as PlayerRace,
                )}
                width="150"
                height="150"
                alt=""
              />
            </Group>
            {/* Only while the captcha is actually pending (not next to a refusal). */}
            {showCaptcha && !error && (
              <Text size="md">{t('recruit.pleaseWaitCaptcha')}</Text>
            )}
          </div>
        </div>
      )}
      <div className="flex items-center justify-center">
        <div className="container mx-auto text-center">
          {stateBlock}
          {isExternal &&
            ready &&
            !succeeded &&
            !error &&
            allowance.dailyCap !== undefined &&
            allowance.perIpCap !== undefined &&
            allowance.remaining !== undefined &&
            allowance.perIpRemaining !== undefined && (
              <Text size="sm" mt="md">
                {t('recruit.externalAllowance', {
                  remaining: allowance.remaining,
                  limit: allowance.dailyCap,
                  ipRemaining: allowance.perIpRemaining,
                  ipLimit: allowance.perIpCap,
                })}
              </Text>
            )}
          {!signedIn && (
            <>
              <Space h="md" />
              <Text size="md">{t('recruit.dontHaveAccount')}</Text>
              <Button onClick={onRegister}>{t('buttons.register')}</Button>
            </>
          )}
          <Space h="md" />
          <Divider />
          <Space h="md" />
          <GameCard title={t('recruit.antiSpamPolicyTitle')}>
            <Text size="sm">{t('recruit.antiSpamPolicy')}</Text>
            <Space h="md" />
            <Text size="sm">{t('recruit.captchaPolicy')}</Text>
          </GameCard>
        </div>
      </div>
    </div>
  );
}
