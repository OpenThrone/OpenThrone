// src/utils/timefunctions.ts
/* eslint-disable import/prefer-default-export */

import type { ReactNode } from 'react';

/**
 * Read the turn interval from environment with safe fallback.
 * Uses NEXT_PUBLIC_TURN_INTERVAL_MINUTES for client bundles,
 * and falls back to TURN_INTERVAL_MINUTES for server if present.
 */
function getTurnIntervalMinutes(): number {
  const raw =
    process.env.NEXT_PUBLIC_TURN_INTERVAL_MINUTES ??
    process.env.TURN_INTERVAL_MINUTES;

  const minutes = Number(raw);
  return Number.isFinite(minutes) && minutes > 0 ? minutes : 30;
}

/**
 * Calculate remaining time until a given ISO date/time.
 * @param endtime ISO string or any Date-parsable string
 */
export function getTimeRemaining(endtime: string) {
  const total = Date.parse(endtime) - Date.now();
  const seconds = Math.floor((total / 1000) % 60);
  const minutes = Math.floor((total / 1000 / 60) % 60);
  const hours = Math.floor((total / (1000 * 60 * 60)) % 24);
  const days = Math.floor(total / (1000 * 60 * 60 * 24));

  return { total, days, hours, minutes, seconds };
}

/**
 * Get a stringified Date for the next turn boundary based on the interval.
 * @param date The baseline date (defaults to now)
 */
export function getTimeToNextTurn(date: Date = new Date()): string {
  const turnIntervalMinutes = getTurnIntervalMinutes();
  const ms = turnIntervalMinutes * 60 * 1000;
  const nextTurn = new Date(Math.ceil(date.getTime() / ms) * ms);
  return nextTurn.toString();
}

/** Server time (not guaranteed to be the client’s clock). */
export function getOTTime(): Date {
  return new Date();
}

/**
 * Start-of-day Date for OT time, optionally offset by N days.
 * @param add Day offset (can be negative), defaults to 0
 */
export function getOTStartDate(add: number = 0): Date {
  const t = getOTTime();
  return new Date(t.getFullYear(), t.getMonth(), t.getDate() + add);
}

/**
 * Human-friendly timestamp for message lists.
 * Returns "HH:MM" if today, else locale date string.
 */
export function formatLastMessageTime(
  lastMessageTime: string | number | Date
): ReactNode {
  const date = new Date(lastMessageTime);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  return isToday
    ? date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : date.toLocaleDateString();
}
