import React, { useState, useEffect } from "react";
import {
  NumberInput,
  Group,
  Button,
  useMantineTheme,
  NumberInputProps,
} from "@mantine/core";

export interface StepPickerNumberInputProps
  extends Omit<NumberInputProps, "step"> {
  /** available step‑presets, e.g. [1,10,100] */
  steps?: number[];
  /** initial step value (falls back to steps[0] or 1) */
  defaultStep?: number;
}

export function StepPickerNumberInput({
  value,
  onChange,
  steps = [1, 10, 100],
  defaultStep,
  ...others
}: StepPickerNumberInputProps) {
  const theme = useMantineTheme();
  // internal state for the currently selected step
  const initial = defaultStep ?? steps[0] ?? 1;
  const [currentStep, setCurrentStep] = useState<number>(initial);

  // if parent ever changes defaultStep or steps[0], sync up
  useEffect(() => {
    if (defaultStep != null && defaultStep !== currentStep) {
      setCurrentStep(defaultStep);
    }
  }, [defaultStep]);

  return (
    <div className="flex flex-col space-y-2">
      <NumberInput
        value={value}
        onChange={onChange}
        step={currentStep}
        {...others}
      />

      <Group spacing="xs" noWrap className="overflow-x-auto">
        {steps.map((step) => (
          <Button
            key={step}
            size="xs"
            variant={step === currentStep ? "filled" : "light"}
            color={theme.primaryColor}
            onClick={() => setCurrentStep(step)}
            className="flex-shrink-0"
          >
            ×{step}
          </Button>
        ))}
      </Group>
    </div>
  );
}
