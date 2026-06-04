import { Button, Modal, NumberInput, Stack } from '@mantine/core';
import { useForm } from '@mantine/form';
import { useTranslation } from 'next-i18next';
import { useState } from 'react';

import { alertService } from '@/services/Alert.service';

interface DeclareWarModalProps {
  opened: boolean;
  onClose: () => void;
  allianceId: number;
}

export const DeclareWarModal = ({
  opened,
  onClose,
  allianceId,
}: DeclareWarModalProps) => {
  const { t } = useTranslation('alliances');
  const [loading, setLoading] = useState(false);

  // We only support declaring war on other Alliances for this MVP
  const form = useForm({
    initialValues: {
      targetAllianceId: '',
    },
    validate: {
      targetAllianceId: (value) =>
        value ? null : 'Target Alliance ID is required',
    },
  });

  const handleSubmit = async (values: typeof form.values) => {
    setLoading(true);
    try {
      const res = await fetch('/api/alliances/wars/declare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          allianceId,
          defenderAllianceId: Number(values.targetAllianceId),
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      alertService.success(
        t('war.declareSuccess', 'War declared successfully!'),
      );
      onClose();
      form.reset();
    } catch (error: any) {
      alertService.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={t('war.declareTitle', 'Declare War')}
    >
      <form onSubmit={form.onSubmit(handleSubmit)}>
        <Stack>
          <NumberInput
            label={t('war.targetAllianceId', 'Target Alliance ID')}
            placeholder="Enter ID"
            required
            min={1}
            {...form.getInputProps('targetAllianceId')}
          />
          {/* TODO: Add User Search / Alliance Search later */}

          <Button type="submit" color="red" loading={loading}>
            {t('war.declareButton', 'Declare War')}
          </Button>
        </Stack>
      </form>
    </Modal>
  );
};
