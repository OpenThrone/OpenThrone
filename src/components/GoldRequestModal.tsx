import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Modal, Button, TextInput, Textarea, Alert, Group, Stack, Text } from '@mantine/core';
import { GoldRequestSchema } from '@/lib/validation';
import { getCompleteFriendTransferConfig } from '@/services/Config.service';
import { useUser } from '@/context/users';

interface GoldRequestModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetUserId: number;
  targetUserName: string;
  onRequestComplete: () => void;
}

export function GoldRequestModal({ 
  isOpen, 
  onClose, 
  targetUserId, 
  targetUserName, 
  onRequestComplete 
}: GoldRequestModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { forceUpdate } = useUser();
  const config = getCompleteFriendTransferConfig();
  
  const { register, handleSubmit, formState: { errors }, watch } = useForm({
    resolver: zodResolver(GoldRequestSchema),
    defaultValues: {
      amount: '',
      friendId: targetUserId,
      notes: ''
    }
  });

  const watchedAmount = watch('amount');

  const onSubmit = async (data: any) => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch('/api/social/gold-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          friendId: data.friendId,
          amount: data.amount,
          notes: data.notes
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Request failed');
      }
      
      forceUpdate();
      onRequestComplete();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed');
    } finally {
      setLoading(false);
    }
  };

  const formatNumber = (num: bigint): string => {
    return num.toLocaleString();
  };

  return (
    <Modal 
      opened={isOpen} 
      onClose={onClose} 
      title={`Request Gold from ${targetUserName}`}
      size="md"
    >
      <form onSubmit={handleSubmit(onSubmit)}>
        {error && (
          <Alert color="red" mb="md">
            {error}
          </Alert>
        )}
        
        <Stack gap="md">
          <TextInput
            label="Request Amount"
            placeholder="Enter amount"
            {...register('amount')}
            type="number"
            min={1000}
            max={Number(config.maxAmount)}
            step={100}
            required
          />
          {errors.amount && (
            <Text color="red" size="sm">{errors.amount.message}</Text>
          )}
          
          {/* Request Information */}
          <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
            <Text size="sm" mb="xs" className="text-gray-400">Request Information</Text>
            <Stack gap="xs">
              <Text size="xs" color="dimmed">
                Maximum request: {formatNumber(config.maxAmount)} gold
              </Text>
              <Text size="xs" color="dimmed">
                The recipient can choose to accept or decline this request
              </Text>
              <Text size="xs" color="dimmed">
                Requests expire after 7 days
              </Text>
            </Stack>
          </div>
          
          <Textarea
            label="Reason (Optional)"
            placeholder="Why are you requesting gold?"
            {...register('notes')}
            minRows={2}
            maxRows={3}
            maxLength={500}
            resize="vertical"
          />
          {errors.notes && (
            <Text color="red" size="sm">{errors.notes.message}</Text>
          )}
          
          <Group justify="flex-end" mt="md">
            <Button 
              type="button" 
              variant="outline" 
              onClick={onClose}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button 
              type="submit" 
              loading={loading}
              disabled={!watchedAmount || 
                       BigInt(watchedAmount) <= BigInt(0) ||
                       !config.enabled}
            >
              Send Request
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}