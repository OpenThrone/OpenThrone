import { Group, Input, NumberInput, Slider, Stack, Text } from '@mantine/core';
import { useId, useState } from 'react';

import classes from '@/components/battle/QuantitySlider.module.css';
import { clampMissionQuantity } from '@/utils/missionQuantity';

interface QuantitySliderProps {
  label: string;
  description?: string;
  min: number;
  max: number;
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  inputTestId?: string;
}

/** Exact entry and a keyboard-accessible slider share one bounded selection. */
export default function QuantitySlider({
  label,
  description,
  min,
  max,
  value,
  onChange,
  disabled = false,
  inputTestId,
}: QuantitySliderProps) {
  const id = useId();
  // Typed text stays editable until blur, so intermediate values ("" or a
  // first digit below `min`) never snap the field back mid-entry.
  const [draft, setDraft] = useState<string | null>(null);
  const unavailable = max < min;
  const lower = unavailable ? 0 : min;
  const upper = unavailable ? 0 : Math.floor(max);
  const selection = clampMissionQuantity(value, min, max);
  const midpoint = Math.floor((lower + upper) / 2);
  const ticks =
    upper - lower <= 9
      ? Array.from({ length: upper - lower + 1 }, (_, index) => lower + index)
      : [lower, midpoint, upper];
  const marks = unavailable
    ? []
    : ticks.map((tick) => ({
        value: tick,
        label:
          upper - lower <= 4 || [lower, midpoint, upper].includes(tick)
            ? String(tick)
            : undefined,
      }));
  const descriptionId = description ? `${id}-description` : undefined;
  const sliderDisabled = disabled || unavailable || lower === upper;

  return (
    <Stack gap={8} className={classes.control}>
      <Group justify="space-between" wrap="nowrap" gap="sm">
        <Input.Label htmlFor={id} className={classes.label}>
          {label}
        </Input.Label>
        <NumberInput
          id={id}
          aria-describedby={descriptionId}
          value={draft ?? selection}
          min={lower}
          max={upper}
          step={1}
          allowDecimal={false}
          allowNegative={false}
          clampBehavior="none"
          disabled={disabled || unavailable || lower === upper}
          w={80}
          classNames={{ input: classes.input, root: classes.number }}
          onChange={(next) => {
            setDraft(String(next));
            const parsed = typeof next === 'number' ? next : Number.NaN;
            if (Number.isInteger(parsed) && parsed >= lower && parsed <= upper)
              onChange(parsed);
          }}
          onBlur={() => {
            if (draft !== null && draft !== '')
              onChange(clampMissionQuantity(Number(draft), min, max));
            setDraft(null);
          }}
          data-testid={inputTestId}
        />
      </Group>
      <div {...{ inert: sliderDisabled || undefined }}>
        <Slider
          thumbLabel={label}
          aria-describedby={descriptionId}
          aria-disabled={sliderDisabled || undefined}
          value={selection}
          onChange={(next) => {
            setDraft(null);
            onChange(next);
          }}
          min={lower}
          max={Math.max(lower + 1, upper)}
          step={1}
          marks={marks}
          label={null}
          disabled={sliderDisabled}
          size={6}
          thumbSize={20}
          classNames={{
            root: classes.slider,
            bar: classes.bar,
            thumb: classes.thumb,
            mark: classes.mark,
            markLabel: classes.markLabel,
          }}
        />
      </div>
      {description && (
        <Text id={descriptionId} size="xs" c="var(--ot-muted)" lh={1.5}>
          {description}
        </Text>
      )}
    </Stack>
  );
}
