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

/**
 * The game's clock. Every daily rule (caps, pressure, recruiting, crons,
 * analytics) and every displayed "OT Time" uses this zone, regardless of the
 * server's or the viewer's own timezone.
 */
export const OT_TIME_ZONE = 'America/New_York';

/** The current instant; "OT Time" is this instant read in OT_TIME_ZONE. */
export function getOTTime(): Date {
  return new Date();
}

type ZonedParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

const zonedFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: OT_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

function zonedParts(date: Date): ZonedParts {
  const parts: Record<string, number> = {};
  for (const { type, value } of zonedFormatter.formatToParts(date)) {
    if (type !== 'literal') parts[type] = Number(value);
  }
  return {
    year: parts.year ?? 1970,
    month: parts.month ?? 1,
    day: parts.day ?? 1,
    hour: (parts.hour ?? 0) % 24,
    minute: parts.minute ?? 0,
    second: parts.second ?? 0,
  };
}

/** Calendar day of an instant in OT time, as YYYY-MM-DD. */
export function getOTDayKey(date: Date = getOTTime()): string {
  const p = zonedParts(date);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** Instant of OT-zone wall-clock components (handles DST by correcting once). */
export function otWallClockToDate(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
): Date {
  const wall = Date.UTC(year, month - 1, day, hour, minute, second);
  const guess = new Date(wall);
  const g = zonedParts(guess);
  const guessWall = Date.UTC(
    g.year,
    g.month - 1,
    g.day,
    g.hour,
    g.minute,
    g.second,
  );
  let instant = wall - (guessWall - wall);
  const check = zonedParts(new Date(instant));
  const checkWall = Date.UTC(
    check.year,
    check.month - 1,
    check.day,
    check.hour,
    check.minute,
    check.second,
  );
  if (checkWall !== wall) instant -= checkWall - wall;
  return new Date(instant);
}

/**
 * Start of an OT-time calendar day, optionally offset by N days.
 * @param add Day offset (can be negative), defaults to 0
 * @param from Instant to anchor on, defaults to now
 */
export function getOTStartDate(
  add: number = 0,
  from: Date = getOTTime(),
): Date {
  const p = zonedParts(from);
  return otWallClockToDate(p.year, p.month, p.day + add);
}

/** Formats an instant as an OT-time clock reading ("HH:MM" by default). */
export function formatOTTime(
  date: Date = getOTTime(),
  options: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit' },
  locale: string = 'en-US',
): string {
  return date.toLocaleTimeString(locale, {
    ...options,
    hour12: false,
    timeZone: OT_TIME_ZONE,
  });
}

/**
 * Human-friendly timestamp for message lists.
 * Returns "HH:MM" if today, else locale date string.
 */
export function formatLastMessageTime(
  lastMessageTime: string | number | Date,
): ReactNode {
  const date = new Date(lastMessageTime);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  return isToday
    ? date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : date.toLocaleDateString();
}
