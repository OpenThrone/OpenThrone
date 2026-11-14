import { describe, expect, it } from 'bun:test';

import {
  createAlertDeduper,
  describeGameAlert,
  formatGoldAmount,
  GAME_ALERT_EVENTS,
} from '@/hooks/gameEventAlerts';
import { USER_MAILBOX_NOTIFY_EVENTS } from '@/lib/realtimeTransport';

/** Echoes the key and its options so assertions see what was translated. */
const t = (key: string, options?: Record<string, unknown>) =>
  options ? `${key} ${JSON.stringify(options)}` : key;

describe('describeGameAlert', () => {
  it('links an attack to its battle report', () => {
    expect(
      describeGameAlert(
        'attackNotification',
        { hash: 'h', battleId: 42, attackerId: 7 },
        t,
        'en',
      ),
    ).toEqual({
      severity: 'error',
      title: 'gameAlerts.attackTitle',
      message: 'gameAlerts.attack',
      link: { href: '/battle/results/42', label: 'gameAlerts.viewReport' },
    });
  });

  it('names the stopped spy mission in the player language', () => {
    const alert = describeGameAlert(
      'spyDefenseNotification',
      { attackLogId: 9, missionType: 'ASSASSINATE' },
      t,
      'en',
    );
    expect(alert?.message).toBe(
      'gameAlerts.spy {"mission":"gameAlerts.missions.ASSASSINATE"}',
    );
    expect(alert?.link?.href).toBe('/battle/results/9');
  });

  it('formats received gold for the locale and names the sender', () => {
    const alert = describeGameAlert(
      'goldTransferReceived',
      { amount: '1500000', senderName: 'Aldric' },
      t,
      'de',
    );
    expect(alert?.message).toBe(
      'gameAlerts.gold {"name":"Aldric","amount":"1.500.000"}',
    );
  });

  it('falls back to "someone" when the sender has no name', () => {
    const alert = describeGameAlert(
      'friendRequestNotification',
      { senderName: '  ' },
      t,
      'en',
    );
    expect(alert?.message).toBe(
      'gameAlerts.friend {"name":"gameAlerts.someone"}',
    );
    expect(alert?.link?.href).toBe('/social/requests');
  });

  it('ignores malformed payloads instead of showing a broken toast', () => {
    expect(describeGameAlert('attackNotification', {}, t, 'en')).toBeNull();
    expect(
      describeGameAlert('attackNotification', { battleId: -1 }, t, 'en'),
    ).toBeNull();
    expect(
      describeGameAlert(
        'spyDefenseNotification',
        { attackLogId: 3, missionType: 'BRIBE' },
        t,
        'en',
      ),
    ).toBeNull();
    expect(describeGameAlert('goldTransferReceived', null, t, 'en')).toBeNull();
  });
});

describe('formatGoldAmount', () => {
  it('groups whole amounts beyond the safe integer range', () => {
    expect(formatGoldAmount('9007199254740993', 'en')).toBe(
      '9,007,199,254,740,993',
    );
  });

  it('leaves non-numeric labels as they are', () => {
    expect(formatGoldAmount('lots', 'en')).toBe('lots');
  });
});

describe('createAlertDeduper', () => {
  it('shows a notice once per hash and forgets the oldest past the limit', () => {
    const show = createAlertDeduper(2);
    expect(show('a')).toBe(true);
    expect(show('a')).toBe(false);
    expect(show('b')).toBe(true);
    expect(show('c')).toBe(true);
    expect(show('a')).toBe(true);
  });

  it('always shows notices without a hash', () => {
    const show = createAlertDeduper();
    expect(show(undefined)).toBe(true);
    expect(show(undefined)).toBe(true);
  });
});

describe('mailbox allowlist', () => {
  it('lets every alert event through the Durable Object mailbox', () => {
    for (const event of GAME_ALERT_EVENTS) {
      expect(USER_MAILBOX_NOTIFY_EVENTS as readonly string[]).toContain(event);
    }
  });
});
