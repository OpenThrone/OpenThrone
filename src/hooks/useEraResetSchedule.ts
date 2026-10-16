import useSWR from 'swr';

import { OT_TIME_ZONE } from '@/utils/timefunctions';

export interface EraResetNotice {
  id: string;
  eraId: number;
  resetAt: string;
  enableLogins: boolean;
  state: 'pending' | 'closing';
}

export function useEraResetSchedule() {
  return useSWR<EraResetNotice | null>(
    '/api/era-reset-schedule',
    async (url: string) => {
      const response = await fetch(url);
      if (!response.ok) throw new Error('Era reset schedule unavailable');
      return response.json();
    },
    { refreshInterval: 5000, revalidateOnFocus: true },
  );
}

/** Same instant in the viewer's own clock. */
export function formatEraResetLocalTime(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${pad(date.getFullYear() % 100)} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

/** Fixed OT-time format (the sidebar clock) removes timezone ambiguity. */
export function formatEraResetTime(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: OT_TIME_ZONE,
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('day')}/${get('month')}/${get('year')} ${get('hour')}:${get('minute')}:${get('second')} OT`;
}
