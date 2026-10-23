import { Turnstile } from '@marsidev/react-turnstile';
import { useRouter } from 'next/router';
import { useTranslation } from 'next-i18next';
import React, { useCallback, useEffect, useState } from 'react';

import MainArea from '@/components/MainArea';
import RecruitmentFlowView from '@/components/RecruitmentFlowView';
import { useUser } from '@/context/users';
import { useRecruitmentStatus } from '@/hooks/useRecruitmentStatus';
import { alertService } from '@/services/Alert.service';
import { logError } from '@/utils/logger';
import { formatResetTime, recruitsLeftFor } from '@/utils/recruitmentStatus';

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
  EXTERNAL_DAILY_CAP_REACHED: 'recruit.externalCapReached',
  IP_DAILY_CAP_REACHED: 'recruit.ipCapReached',
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

const allowanceNumber = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
    ? value
    : undefined;

const firstQueryValue = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

/** Recruit. */
export default function RecruitmentFlow({
  recruitLink,
  mode = 'internal',
  embedded = false,
  onBusyChange,
  targetId,
  targetName,
  onRecruited,
}: {
  recruitLink?: string;
  mode?: 'internal' | 'external';
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
  const isExternal = mode === 'external';
  const isAutoRecruit = !isExternal && !embedded && autoRecruitParams === '1';
  const skips = Math.max(0, Number(firstQueryValue(router.query.skips)) || 0);
  const id = recruitLink ?? firstQueryValue(router.query.id);
  const [succeeded, setSucceeded] = useState(false);
  const [retry, setRetry] = useState(0);
  const [showCaptcha, setShowCaptcha] = useState(false);
  const [ready, setReady] = useState(false);
  const [allowance, setAllowance] = useState<{
    dailyCap?: number;
    perIpCap?: number;
    remaining?: number;
    perIpRemaining?: number;
  }>({});
  const [submitting, setSubmitting] = useState(false);

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
      if (key)
        return t(key, {
          limit:
            result.data.code === 'IP_DAILY_CAP_REACHED'
              ? result.data.perIpCap
              : result.data.dailyCap,
        });
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
          window.location.href = `/recruit/${link}?mode=internal&auto_recruit=1&skips=${nextSkips}`;
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
    setReady(false);
    setAllowance({});
    setUserInfo(null);

    const checkRecruitmentHistory = async () => {
      try {
        const result = await requestJson(
          `/api/recruit/${isExternal ? 'external/' : ''}${encodeURIComponent(id)}`,
        );
        if (cancelled) return;
        if (result.ok && !result.data.code && result.data.eligible !== false) {
          setAllowance({
            dailyCap: allowanceNumber(result.data.dailyCap),
            perIpCap: allowanceNumber(result.data.perIpCap),
            remaining: allowanceNumber(result.data.remaining),
            perIpRemaining: allowanceNumber(result.data.perIpRemaining),
          });
          setReady(true);
          setShowCaptcha(Boolean(result.data.showCaptcha));
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
  }, [handleRefusal, id, isExternal, retry, stopWith, t]);

  const handleCaptchaSuccess = async (
    event?: React.FormEvent,
    captchaToken?: string,
  ) => {
    event?.preventDefault();
    if (formRef.current === null || submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    onBusyChange?.(true);
    try {
      const formData = new FormData(formRef.current);
      const token = captchaToken ?? formData.get('cf-turnstile-response');

      const result = await requestJson(
        isExternal
          ? `/api/recruit/external/${encodeURIComponent(id ?? '')}`
          : '/api/recruit/handleRecruitment',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            recruitedUserId: id,
            selfRecruit: false,
            captchaToken: token,
          }),
        },
      );

      if (result.ok && result.data.success) {
        alertService.success(
          t(isExternal ? 'recruit.externalCompleted' : 'recruit.completed', {
            name: userInfo?.display_name ?? targetName ?? '',
          }),
          true,
        );
        // Reload user data like the sidebar refresh button
        if (user) forceUpdate();
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
      setSubmitting(false);
      onBusyChange?.(false);
    }
  };

  const captchaSlot = showCaptcha ? (
    <Turnstile
      siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_ID || ''}
      onSuccess={(token) => {
        return handleCaptchaSuccess(undefined, token);
      }}
      onExpire={() => stopWith(t('recruit.verificationExpired'))}
      onError={() => stopWith(t('recruit.verificationFailed'))}
    />
  ) : null;

  const pairLeft =
    targetId && recruitStatus
      ? (recruitsLeftFor(recruitStatus, targetId) ?? 0)
      : null;
  const pairProgress =
    targetId && recruitStatus && pairLeft !== null
      ? {
          name: targetName ?? '',
          used: recruitStatus.targets[String(targetId)]?.pairUsed ?? 0,
          limit: recruitStatus.pairLimit,
          left: pairLeft,
          resetsAt: formatResetTime(recruitStatus.resetsAt),
        }
      : null;

  const view = (
    <RecruitmentFlowView
      isExternal={isExternal}
      signedIn={Boolean(user)}
      embedded={embedded}
      submitting={submitting}
      error={error}
      succeeded={succeeded}
      ready={ready}
      showCaptcha={showCaptcha}
      allowance={allowance}
      userInfo={userInfo}
      targetName={targetName}
      pairProgress={pairProgress}
      formRef={formRef}
      captchaSlot={captchaSlot}
      onSubmit={handleCaptchaSuccess}
      onRetry={() => setRetry((value) => value + 1)}
      onRegister={() => router.push(`/account/register`)}
    />
  );

  if (embedded) {
    return view;
  }

  return <MainArea title={t('recruit.title')}>{view}</MainArea>;
}
