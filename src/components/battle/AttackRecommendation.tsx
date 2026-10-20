import { Accordion, Anchor, Divider, Group, Stack, Text } from '@mantine/core';
import { useTranslation } from 'next-i18next';
import { useEffect, useState } from 'react';

import type { AttackRecommendation as Recommendation } from '@/utils/attackRecommendation';

interface Props {
  targetId?: number;
  viewerId?: number;
  opened: boolean;
}

export default function AttackRecommendation({
  targetId,
  viewerId,
  opened,
}: Props) {
  const { t, i18n } = useTranslation('battle');
  const [result, setResult] = useState<{
    targetId: number;
    viewerId: number;
    data: Recommendation;
  } | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'unavailable'>(
    'loading',
  );
  const [expanded, setExpanded] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    setResult(null);
    setExpanded(null);
    setStatus('loading');
  }, [opened, targetId, viewerId]);
  // Fetch on open and on expand only; a local clock keeps the age label current.
  useEffect(() => {
    if (!opened || !targetId || !viewerId) return undefined;
    const currentTargetId = targetId;
    const currentViewerId = viewerId;
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch(`/api/attack/${targetId}/recommendation`, {
          cache: 'no-store',
          signal: controller.signal,
        });
        if (!response.ok) throw new Error('Recommendation unavailable');
        const data: Recommendation = await response.json();
        if (!controller.signal.aborted) {
          setResult({
            targetId: currentTargetId,
            viewerId: currentViewerId,
            data,
          });
          setNow(Date.now());
          setStatus('ready');
        }
      } catch {
        if (!controller.signal.aborted) {
          setResult(null);
          setStatus('unavailable');
        }
      }
    }
    load();
    return () => controller.abort();
  }, [opened, targetId, viewerId, reloadKey]);
  useEffect(() => {
    if (!opened) return undefined;
    const tick = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(tick);
  }, [opened]);
  const handleExpandedChange = (value: string | null) => {
    setExpanded(value);
    if (value) setReloadKey((key) => key + 1);
  };
  const data =
    opened && result?.targetId === targetId && result?.viewerId === viewerId
      ? result.data
      : null;
  const verdict = data?.verdict;
  const newest = data?.evidence[0];
  const ageMinutes = newest
    ? Math.max(0, Math.floor((now - Date.parse(newest.timestamp)) / 60_000))
    : 0;
  return (
    <>
      <Divider my="lg" />
      <Accordion
        value={expanded}
        onChange={handleExpandedChange}
        variant="default"
        transitionDuration={0}
        styles={{
          control: { paddingInline: 0 },
          panel: { paddingInline: 0 },
          item: { border: 0 },
        }}
      >
        <Accordion.Item value="recommendation">
          <Accordion.Control>
            <Stack gap={4}>
              <Group gap="xs" justify="space-between" pr="xs">
                <Text fw={600} c="var(--ot-heading)">
                  {t('recommendation.title')}
                </Text>
                <Text size="xs" c="var(--ot-muted)">
                  {newest
                    ? t(`recommendation.age.${newest.kind}`, {
                        count: ageMinutes,
                      })
                    : t('recommendation.limitedEvidence')}
                </Text>
              </Group>
              <Text size="sm" c="var(--ot-muted)" role="status">
                {t(
                  `recommendation.verdict.${verdict ?? (status === 'unavailable' ? 'unavailable' : 'loading')}`,
                )}
              </Text>
            </Stack>
          </Accordion.Control>
          <Accordion.Panel>
            <Stack gap="sm">
              <Text size="sm">
                {t(`recommendation.detail.${verdict ?? 'insufficient'}`)}
              </Text>
              {data && (
                <Text size="sm" c="var(--ot-muted)">
                  {t(`recommendation.activity.${data.activity}`)}
                </Text>
              )}
              <Text size="xs" c="var(--ot-muted)">
                {t('recommendation.caveat')}
              </Text>
              {data?.evidence.map((report) => (
                <Stack key={report.id} gap={2}>
                  <Anchor
                    href={`/battle/results/${report.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    size="sm"
                  >
                    {t(`recommendation.source.${report.kind}`, {
                      id: report.id,
                    })}
                  </Anchor>
                  <Text size="xs" c="var(--ot-muted)">
                    {new Date(report.timestamp).toLocaleString(i18n.language)}
                    {' · '}
                    {report.kind === 'intel'
                      ? t('recommendation.observedDefense', {
                          value: report.defense,
                        })
                      : t(
                          `recommendation.outcome.${report.won === null ? 'unknown' : report.won ? 'won' : 'lost'}`,
                        )}
                  </Text>
                  <Text size="xs" c="var(--ot-muted)">
                    {t(
                      `recommendation.confidence.${report.confidence <= 0 ? 'expired' : report.confidence <= 0.5 ? 'aging' : 'fresh'}`,
                    )}
                    {report.kind === 'battle' &&
                      ` · ${t(`recommendation.quality.${report.quality}`)}`}
                  </Text>
                </Stack>
              ))}
              {!data?.evidence.length && (
                <Text size="sm">{t('recommendation.gatherIntel')}</Text>
              )}
            </Stack>
          </Accordion.Panel>
        </Accordion.Item>
      </Accordion>
    </>
  );
}
