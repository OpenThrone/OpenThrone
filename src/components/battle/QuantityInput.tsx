import type { ButtonProps } from '@mantine/core';
import { Button, Group, Input, NumberInput } from '@mantine/core';
import { useTranslation } from 'next-i18next';
import type { ReactNode } from 'react';
import { useId, useState } from 'react';

import classes from '@/components/battle/QuantityInput.module.css';
import { ActionTooltip } from '@/components/game/ActionTooltip';

type QuantityValue = number | bigint;

interface QuantityActionProps {
  /** Visible text. */
  children: ReactNode;
  /** Accessible name when the visible text alone is ambiguous. */
  ariaLabel?: string;
  tooltip?: ReactNode;
  disabled?: boolean;
  onClick: () => void;
  variant?: ButtonProps['variant'];
  testId?: string;
}

/** A shortcut beside a quantity field (Max, All owned) with one shape. */
export function QuantityAction({
  children,
  ariaLabel,
  tooltip,
  disabled = false,
  onClick,
  variant = 'default',
  testId,
}: QuantityActionProps) {
  return (
    <ActionTooltip label={tooltip}>
      <Button
        size="sm"
        variant={variant}
        className={classes.action}
        disabled={disabled}
        aria-label={ariaLabel}
        onClick={onClick}
        data-testid={testId}
      >
        {children}
      </Button>
    </ActionTooltip>
  );
}

export interface QuantityInputProps<T extends QuantityValue> {
  /** Accessible name; shown above the field unless `hideLabel`. */
  label: string;
  /** Keep the label for assistive tech only (table cells, unit rows). */
  hideLabel?: boolean;
  description?: ReactNode;
  error?: ReactNode;
  value: T;
  onChange: (value: NoInfer<T>) => void;
  /** Lower bound; defaults to 0. */
  min?: NoInfer<T>;
  /** Upper bound applied on blur; unbounded when omitted. */
  max?: NoInfer<T>;
  disabled?: boolean;
  name?: string;
  inputTestId?: string;
  /** Let the field take the remaining row width. */
  grow?: boolean;
  /** Shows the Max shortcut; the caller decides what "max" means. */
  onMax?: () => void;
  maxAriaLabel?: string;
  maxTooltip?: ReactNode;
  maxDisabled?: boolean;
  maxTestId?: string;
  /** Further shortcuts after Max, built with `QuantityAction`. */
  actions?: ReactNode;
}

const toBig = (value: QuantityValue): bigint =>
  typeof value === 'bigint' ? value : BigInt(Math.floor(value));

/** Digits from the field, or null for an empty or unreadable entry. */
const parseEntry = (entry: number | string): bigint | null => {
  if (typeof entry === 'number')
    return Number.isFinite(entry) ? BigInt(Math.floor(entry)) : null;
  const digits = entry.trim().replace(/[^\d]/g, '');
  return digits === '' ? null : BigInt(digits);
};

/**
 * Whole-number quantity entry with one Max affordance. Works with `number`
 * or `bigint` values; typed text stays editable until blur, where it is
 * clamped to `min`/`max`, so partial entries never snap back mid-typing.
 */
export default function QuantityInput<T extends QuantityValue>({
  label,
  hideLabel = false,
  description,
  error,
  value,
  onChange,
  min,
  max,
  disabled = false,
  name,
  inputTestId,
  grow = false,
  onMax,
  maxAriaLabel,
  maxTooltip,
  maxDisabled = false,
  maxTestId,
  actions,
}: QuantityInputProps<T>) {
  const { t } = useTranslation('common');
  const id = useId();
  const [draft, setDraft] = useState<string | null>(null);
  const isBig = typeof value === 'bigint';
  const lower = min === undefined ? 0n : toBig(min);
  const upper = max === undefined ? null : toBig(max);

  const emit = (next: bigint) => onChange((isBig ? next : Number(next)) as T);
  const clamp = (next: bigint) => {
    if (next < lower) return lower;
    if (upper !== null && next > upper) return upper < lower ? lower : upper;
    return next;
  };

  const descriptionId = description ? `${id}-description` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy =
    [descriptionId, errorId].filter(Boolean).join(' ') || undefined;
  const safeBound = (bound: bigint | null) =>
    bound !== null && bound <= BigInt(Number.MAX_SAFE_INTEGER)
      ? Number(bound)
      : undefined;

  const field = (
    <Group gap="xs" wrap="nowrap" className={classes.row}>
      <NumberInput
        id={id}
        name={name}
        aria-label={hideLabel ? label : undefined}
        aria-describedby={describedBy}
        aria-invalid={error ? true : undefined}
        value={draft ?? value.toString()}
        min={safeBound(lower)}
        max={safeBound(upper)}
        step={1}
        allowDecimal={false}
        allowNegative={false}
        clampBehavior="none"
        hideControls
        disabled={disabled}
        error={Boolean(error)}
        size="sm"
        classNames={{
          root: grow ? `${classes.number} ${classes.grow}` : classes.number,
          input: classes.input,
        }}
        onChange={(next) => {
          const text = String(next);
          setDraft(text);
          const parsed = parseEntry(next);
          if (parsed === null) {
            emit(lower);
            return;
          }
          if (parsed >= lower && (upper === null || parsed <= upper))
            emit(parsed);
        }}
        onBlur={() => {
          if (draft !== null) {
            const parsed = parseEntry(draft);
            emit(clamp(parsed ?? lower));
          }
          setDraft(null);
        }}
        data-testid={inputTestId}
      />
      {onMax && (
        <QuantityAction
          ariaLabel={maxAriaLabel}
          tooltip={maxTooltip}
          disabled={disabled || maxDisabled}
          onClick={() => {
            setDraft(null);
            onMax();
          }}
          testId={maxTestId}
        >
          {t('labels.max')}
        </QuantityAction>
      )}
      {actions}
    </Group>
  );

  if (hideLabel && !description && !error) return field;

  return (
    <Input.Wrapper
      id={id}
      label={hideLabel ? undefined : label}
      description={description}
      error={error}
      errorProps={{ id: errorId }}
      descriptionProps={{ id: descriptionId }}
    >
      {field}
    </Input.Wrapper>
  );
}
