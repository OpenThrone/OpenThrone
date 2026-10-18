import { Button, Divider, Group, Loader, Space, Text } from '@mantine/core';
import { Turnstile } from '@marsidev/react-turnstile';
import { useRouter } from 'next/router';
import { useTranslation } from 'next-i18next';
import React, { useCallback, useEffect, useState } from 'react';

import Image from '@/components/ArtworkImage';
import { GameCard } from '@/components/game/GameCard';
import MainArea from '@/components/MainArea';
import { useUser } from '@/context/users';
import { useRecruitmentStatus } from '@/hooks/useRecruitmentStatus';
import { alertService } from '@/services/Alert.service';
import type { PlayerRace } from '@/types/typings';
import { logError } from '@/utils/logger';
import { formatResetTime, recruitsLeftFor } from '@/utils/recruitmentStatus';
import { getAssetPath } from '@/utils/utilities';

interface RecruitProps {
  id: string;
  display_name: string;
  level: number;
  class: string;
  race: string;
}

interface RecruitApiResult {
  ok: boolean;
  status: number;
  data: { error?: string; code?: string; [key: string]: unknown };
}

/** Codes where this link is unusable but the next auto-recruit target may work. */
const SKIPPABLE_CODES = new Set([
  'PAIR_LIMIT_REACHED',
  'TARGET_DAILY_CAP_REACHED',
]);
/** Retries for transient (network / 5xx) failures when fetching the next link. */
const MAX_TRANSIENT_RETRIES = 2;
/** Consecutive skipped links before auto-recruit gives up. */
const MAX_CONSECUTIVE_SKIPS = 5;

const ERROR_CODE_KEYS: Record<string, string> = {
  LOGIN_REQUIRED: 'recruit.loginRequired',
  SELF_RECRUIT_REJECTED: 'recruit.selfRecruit',
  RECRUITER_DAILY_CAP_REACHED: 'recruit.recruiterCapReached',
  TARGET_DAILY_CAP_REACHED: 'recruit.targetCapReached',
  PAIR_LIMIT_REACHED: 'recruit.pairLimitReached',
  NO_RECRUITABLE_USERS_FOUND: 'recruit.noMoreTargets',
};

const wait = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

/** Fetches JSON without throwing on non-2xx or unparsable bodies. */
const requestJson = async (
  input: string,
  init?: RequestInit,
): Promise<RecruitApiResult> => {
  const response = await fetch(input, init);
  const data = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, data: data ?? {} };
};

const firstQueryValue = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

/** Recruit. */
export default function RecruitmentFlow({
  recruitLink,
  embedded = false,
  onBusyChange,
  targetId,
  targetName,
  onRecruited,
}: {
  recruitLink?: string;
  embedded?: boolean;
  onBusyChange?: (busy: boolean) => void;
  /** Player behind the link; enables the daily recruit counter after a success. */
  targetId?: number;
  targetName?: string;
  onRecruited?: () => void;
} = {}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const autoRecruitParams = firstQueryValue(router.query.auto_recruit);
  const isAutoRecruit = !embedded && autoRecruitParams === '1';
  const skips = Math.max(0, Number(firstQueryValue(router.query.skips)) || 0);
  const id = recruitLink ?? firstQueryValue(router.query.id);
  const [succeeded, setSucceeded] = useState(false);
  const [retry, setRetry] = useState(0);
  const [showCaptcha, setShowCaptcha] = useState(false);
  const formRef = React.useRef<HTMLFormElement | null>(null);
  const submittingRef = React.useRef(false);
  const [userInfo, setUserInfo] = useState<RecruitProps | null>(null);
  const { user, forceUpdate } = useUser();
  const { t } = useTranslation('common');
  const { status: recruitStatus, refresh: refreshStatus } =
    useRecruitmentStatus(targetId ? [targetId] : [], embedded);

  /** Localized message for an API refusal, falling back to the server text. */
  const messageFor = useCallback(
    (result: RecruitApiResult) => {
      const key = result.data.code ? ERROR_CODE_KEYS[result.data.code] : null;
      if (key) return t(key);
      if (result.status >= 500) return t('recruit.temporaryError');
      return result.data.error ?? t('recruit.temporaryError');
    },
    [t],
  );

  const stopWith = useCallback(
    (message: string) => {
      setShowCaptcha(false);
      setError(message);
      if (isAutoRecruit) {
        alertService.error(
          t('recruit.autoRecruitStopped', { reason: message }),
        );
      }
    },
    [isAutoRecruit, t],
  );

  /**
   * Moves to the next auto-recruit link. Stops on any refusal (cap reached,
   * no targets, disabled, signed out) and only retries transient failures, so
   * it can never spin on a 4xx.
   */
  const autoRecruit = useCallback(
    async (nextSkips: number = 0) => {
      if (nextSkips >= MAX_CONSECUTIVE_SKIPS) {
        stopWith(t('recruit.noMoreTargets'));
        return;
      }
      for (let attempt = 0; ; attempt += 1) {
        let result: RecruitApiResult | null = null;
        try {
          result = await requestJson('/api/recruit/auto-recruit');
        } catch (fetchError) {
          logError('Error fetching next recruit link:', fetchError);
        }
        const transient =
          !result || (result.status >= 500 && result.status !== 503);
        if (transient && attempt < MAX_TRANSIENT_RETRIES) {
          await wait(1000 * (attempt + 1));
          continue;
        }
        if (!result?.ok || typeof result.data.recruit_link !== 'string') {
          stopWith(result ? messageFor(result) : t('recruit.temporaryError'));
          return;
        }
        const link = encodeURIComponent(result.data.recruit_link);
        // Delay for 1 second before navigating to the next recruitment link
        setTimeout(() => {
          window.location.href = `/recruit/${link}?auto_recruit=1&skips=${nextSkips}`;
        }, 1000);
        return;
      }
    },
    [messageFor, stopWith, t],
  );

  /** Handles a refusal for this link: skip to the next target or stop. */
  const handleRefusal = useCallback(
    async (result: RecruitApiResult) => {
      const code = result.data.code ?? '';
      if (isAutoRecruit && SKIPPABLE_CODES.has(code)) {
        setError(messageFor(result));
        await autoRecruit(skips + 1);
        return;
      }
      stopWith(messageFor(result));
    },
    [autoRecruit, isAutoRecruit, messageFor, skips, stopWith],
  );

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setError(null);
    setShowCaptcha(false);
    setSucceeded(false);

    const checkRecruitmentHistory = async () => {
      try {
        const result = await requestJson(
          `/api/recruit/${encodeURIComponent(id)}`,
        );
        if (cancelled) return;
        if (result.ok && result.data.showCaptcha) {
          setShowCaptcha(true);
          return;
        }
        await handleRefusal(result);
      } catch (fetchError) {
        logError('Error checking recruitment eligibility:', fetchError);
        if (!cancelled) stopWith(t('recruit.temporaryError'));
      }
    };

    checkRecruitmentHistory();
    const fetchUserInfo = async () => {
      try {
        const result = await requestJson(
          `/api/general/getUserInfoByRecruitLink?recruit_link=${encodeURIComponent(id)}`,
        );
        if (cancelled) return;
        if (result.ok && !result.data.error) {
          setUserInfo(result.data as unknown as RecruitProps);
        } else {
          logError('Error fetching user info:', result.data.error);
        }
      } catch (fetchError) {
        logError('Error fetching user info:', fetchError);
      }
    };

    fetchUserInfo();
    return () => {
      cancelled = true;
    };
  }, [handleRefusal, id, retry, stopWith, t]);

  const handleCaptchaSuccess = async (
    event?: React.FormEvent,
    captchaToken?: string,
  ) => {
    event?.preventDefault();
    if (formRef.current === null || submittingRef.current) return;
    submittingRef.current = true;
    onBusyChange?.(true);
    try {
      const formData = new FormData(formRef.current);
      const token = captchaToken ?? formData.get('cf-turnstile-response');

      const captcha = await requestJson('/api/captcha/verify', {
        method: 'POST',
        body: JSON.stringify({ token }),
        headers: {
          'content-type': 'application/json',
        },
      });
      if (!captcha.ok || !captcha.data.success) {
        stopWith(messageFor(captcha));
        return;
      }

      const result = await requestJson('/api/recruit/handleRecruitment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          recruitedUserId: id,
          selfRecruit: false,
        }),
      });

      if (result.ok && result.data.success) {
        alertService.success(t('recruit.completed'), true);
        // Reload user data like the sidebar refresh button
        forceUpdate();
        if (embedded) {
          // Show the updated daily count, not the one from before this recruit.
          await refreshStatus().catch((statusError) =>
            logError('Error refreshing recruitment status:', statusError),
          );
          onRecruited?.();
        }
        setShowCaptcha(false);
        setSucceeded(true);
        if (isAutoRecruit) {
          await autoRecruit(0);
        }
        return;
      }

      await handleRefusal(result);
    } catch (submitError) {
      logError('Error submitting recruitment:', submitError);
      stopWith(t('recruit.temporaryError'));
    } finally {
      submittingRef.current = false;
      onBusyChange?.(false);
    }
  };

  if (embedded) {
    return (
      <div>
        {!succeeded && (
          <Text mb="md">
            {t(user ? 'recruit.forYourKingdom' : 'recruit.signInToRecruit')}
          </Text>
        )}
        {succeeded ? (
          <>
            <Text role="status" c="teal.3">
              {t('recruit.completed')}
            </Text>
            {targetId && recruitStatus ? (
              <>
                <Text size="sm" mt="xs">
                  {t('recruit.pairProgress', {
                    name: targetName ?? '',
                    used:
                      recruitStatus.targets[String(targetId)]?.pairUsed ?? 0,
                    limit: recruitStatus.pairLimit,
                  })}
                </Text>
                <Text size="sm" c="dimmed" data-testid="recruits-left">
                  {t('recruit.recruitsLeft', {
                    count: recruitsLeftFor(recruitStatus, targetId) ?? 0,
                    time: formatResetTime(recruitStatus.resetsAt),
                  })}
                </Text>
                {(recruitsLeftFor(recruitStatus, targetId) ?? 0) > 0 && (
                  <Button
                    mt="md"
                    onClick={() => setRetry((value) => value + 1)}
                  >
                    {t('recruit.again')}
                  </Button>
                )}
              </>
            ) : null}
          </>
        ) : error ? (
          <>
            <Text role="alert" mb="md">
              {error}
            </Text>
            <Button onClick={() => setRetry((value) => value + 1)}>
              {t('recruit.retry')}
            </Button>
          </>
        ) : showCaptcha ? (
          <form ref={formRef} onSubmit={handleCaptchaSuccess}>
            <Turnstile
              siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_ID || ''}
              onSuccess={(token) => {
                return handleCaptchaSuccess(undefined, token);
              }}
              onExpire={() => {
                setShowCaptcha(false);
                setError(t('recruit.verificationExpired'));
              }}
              onError={() => {
                setShowCaptcha(false);
                setError(t('recruit.verificationFailed'));
              }}
            />
          </form>
        ) : (
          <Loader size="sm" aria-label={t('recruit.checkingEligibility')} />
        )}
      </div>
    );
  }

  return (
    <MainArea title={t('recruit.title')}>
      {userInfo && (
        <div className="mb-5 items-center text-center">
          <div>
            <Text size="xl">
              {t('recruit.linkFrom', { name: userInfo.display_name })}
            </Text>
            {!error && (
              <Text mb="sm">
                {t(user ? 'recruit.forYourKingdom' : 'recruit.signInToRecruit')}
              </Text>
            )}
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
          {error ? (
            <Text role="alert">{error}</Text>
          ) : (
            showCaptcha && (
              <form
                id="recruitForm"
                ref={formRef}
                onSubmit={handleCaptchaSuccess}
              >
                <div className="flex items-center justify-center">
                  <Turnstile
                    siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_ID || ''}
                    onSuccess={(token) => {
                      return handleCaptchaSuccess(undefined, token);
                    }}
                  />
                </div>
              </form>
            )
          )}
          {!user && (
            <>
              <Space h="md" />
              <Text size="md">{t('recruit.dontHaveAccount')}</Text>
              <Button onClick={() => router.push(`/account/register`)}>
                {t('buttons.register')}
              </Button>
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
    </MainArea>
  );
}
