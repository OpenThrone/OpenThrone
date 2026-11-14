import { describe, expect, it } from 'bun:test';

import {
  buildDoChatUrl,
  buildDoUserUrl,
  resolveRealtimeTransport,
} from '@/lib/realtimeTransport';

describe('resolveRealtimeTransport (transport selection)', () => {
  it('defaults to socketio when no flags are set', () => {
    expect(resolveRealtimeTransport(undefined, undefined)).toBe('socketio');
    expect(resolveRealtimeTransport('', '')).toBe('socketio');
  });

  it('preserves today behavior: the legacy kill switch forces off', () => {
    expect(resolveRealtimeTransport(undefined, 'true')).toBe('off');
    expect(resolveRealtimeTransport(undefined, '1')).toBe('off');
    expect(resolveRealtimeTransport('socketio', 'true')).toBe('off');
    expect(resolveRealtimeTransport('garbage', 'TRUE')).toBe('off');
  });

  it('maps explicit values, case-insensitively', () => {
    expect(resolveRealtimeTransport('socketio', undefined)).toBe('socketio');
    expect(resolveRealtimeTransport('off', undefined)).toBe('off');
    expect(resolveRealtimeTransport('DO', 'true')).toBe('do');
    expect(resolveRealtimeTransport(' do ', undefined)).toBe('do');
  });

  it('lets the do pilot override the legacy kill switch', () => {
    // The pilot path never touches Socket.IO, so it may run where the Node
    // socket server cannot (e.g. a preview built with DISABLE_SOCKET=true).
    expect(resolveRealtimeTransport('do', 'true')).toBe('do');
    expect(resolveRealtimeTransport('do', '1')).toBe('do');
  });

  it('falls back to socketio for unknown values when not disabled', () => {
    expect(resolveRealtimeTransport('carrier-pigeon', undefined)).toBe(
      'socketio',
    );
  });
});

describe('DO websocket URL builders', () => {
  it('converts origins to ws(s) and encodes the ticket', () => {
    const ticket = 'v1.a+b/c==';
    expect(buildDoChatUrl('https://app.example', 42, ticket)).toBe(
      `wss://app.example/do/chat/42?ticket=${encodeURIComponent(ticket)}`,
    );
    expect(buildDoChatUrl('http://localhost:3000', 1, 't')).toBe(
      'ws://localhost:3000/do/chat/1?ticket=t',
    );
    expect(buildDoUserUrl('https://app.example', 7, 't')).toBe(
      'wss://app.example/do/user/7?ticket=t',
    );
  });
});
