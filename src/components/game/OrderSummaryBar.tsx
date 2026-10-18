import { Box, Button, Flex, Group, Stack, Text } from '@mantine/core';
import type React from 'react';
import { useEffect, useRef, useState } from 'react';

import { GameCard } from '@/components/game/GameCard';
import type { Locales } from '@/types/typings';
import { toLocale } from '@/utils/numberFormatting';

const LABEL_STYLE: React.CSSProperties = { letterSpacing: '0.3em' };

const PRIMARY_BUTTON_STYLE: React.CSSProperties = {
  background: 'linear-gradient(180deg, #e5c55a 0%, #b98f2f 100%)',
  color: '#000',
  border: '1px solid #e5c55a',
  boxShadow: '0 4px 10px rgba(0,0,0,0.5)',
};

const SECONDARY_BUTTON_STYLE: React.CSSProperties = {
  backgroundColor: '#1f2b3b',
  borderColor: '#2f3e52',
  color: '#e5e7eb',
  boxShadow: '0 2px 0 #0f151c',
};

export interface OrderSummaryAction {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
  testId?: string;
}

export interface OrderSummaryBarProps {
  /** Renders the bar only while there is something to submit. */
  visible: boolean;
  title: string;
  totalCostLabel: string;
  totalCost: number;
  refundLabel?: string;
  /** Omit to hide the refund column (pages that cannot sell back). */
  refund?: number;
  primaryAction: OrderSummaryAction;
  secondaryAction: OrderSummaryAction;
  /** Optional low-emphasis action that discards the order (e.g. Clear all). */
  clearAction?: OrderSummaryAction;
  hint?: string;
  locale?: Locales;
}

/**
 * Bottom order summary shared by the Training and Armory pages. Docks to the
 * viewport bottom while the end of the page content is off screen and sits
 * inline once the user scrolls to it.
 */
export const OrderSummaryBar: React.FC<OrderSummaryBarProps> = ({
  visible,
  title,
  totalCostLabel,
  totalCost,
  refundLabel,
  refund,
  primaryAction,
  secondaryAction,
  clearAction,
  hint,
  locale,
}) => {
  const [isDocked, setIsDocked] = useState(false);
  const [barHeight, setBarHeight] = useState(0);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const barRef = useRef<HTMLDivElement | null>(null);

  // While docked, a placeholder of the bar's own height keeps the end of the
  // page scrollable out from under it; once the placeholder scrolls into view
  // the bar takes its place inline, so there is never a gap above it.
  useEffect(() => {
    if (!visible) {
      setIsDocked(false);
      return;
    }
    const bar = barRef.current;
    if (!bar) return;
    const measure = () => setBarHeight(bar.getBoundingClientRect().height);
    measure();
    const resize = new ResizeObserver(measure);
    resize.observe(bar);
    return () => resize.disconnect();
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsDocked(!entry.isIntersecting);
      },
      { root: null, threshold: 0.99 },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [visible, barHeight]);

  const anyLoading = Boolean(primaryAction.loading || secondaryAction.loading);

  return (
    <>
      <div
        ref={sentinelRef}
        aria-hidden
        style={{ height: visible && isDocked ? barHeight : 0 }}
      />
      {visible && (
        <Box
          ref={barRef}
          className={`training-order-summary${isDocked ? '' : ' training-order-summary--inline'}`}
          data-testid="order-summary-bar"
        >
          <Box style={{ padding: '0 16px' }}>
            <GameCard title={title} goldAccent>
              <Flex
                justify="space-between"
                align="center"
                wrap="wrap"
                gap="md"
                p="xs"
              >
                <Group gap="xl" wrap="wrap">
                  <Stack gap={2}>
                    <Text
                      size="xs"
                      c="dimmed"
                      tt="uppercase"
                      fw={700}
                      style={LABEL_STYLE}
                    >
                      {totalCostLabel}
                    </Text>
                    <Text size="lg" fw={800} c="gray.1">
                      {toLocale(totalCost, locale)}
                    </Text>
                  </Stack>
                  {refund !== undefined && refundLabel && (
                    <Stack gap={2}>
                      <Text
                        size="xs"
                        c="dimmed"
                        tt="uppercase"
                        fw={700}
                        style={LABEL_STYLE}
                      >
                        {refundLabel}
                      </Text>
                      <Text size="sm" fw={700} c="dimmed">
                        {toLocale(refund, locale)}
                      </Text>
                    </Stack>
                  )}
                </Group>
                <Group gap="sm">
                  {clearAction && (
                    <Button
                      variant="subtle"
                      color="gray"
                      onClick={clearAction.onClick}
                      disabled={clearAction.disabled || anyLoading}
                      data-testid={clearAction.testId}
                    >
                      {clearAction.label}
                    </Button>
                  )}
                  <Button
                    color="yellow"
                    onClick={primaryAction.onClick}
                    disabled={
                      primaryAction.disabled ||
                      (anyLoading && !primaryAction.loading)
                    }
                    loading={primaryAction.loading}
                    style={PRIMARY_BUTTON_STYLE}
                    data-testid={primaryAction.testId}
                  >
                    {primaryAction.label}
                  </Button>
                  <Button
                    color="gray"
                    onClick={secondaryAction.onClick}
                    disabled={
                      secondaryAction.disabled ||
                      (anyLoading && !secondaryAction.loading)
                    }
                    loading={secondaryAction.loading}
                    style={SECONDARY_BUTTON_STYLE}
                    data-testid={secondaryAction.testId}
                  >
                    {secondaryAction.label}
                  </Button>
                </Group>
                {hint && (
                  <Text size="xs" c="dimmed">
                    {hint}
                  </Text>
                )}
              </Flex>
            </GameCard>
          </Box>
        </Box>
      )}
    </>
  );
};

export default OrderSummaryBar;
