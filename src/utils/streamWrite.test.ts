import { EventEmitter } from 'node:events';

import { describe, expect, it, vi } from 'bun:test';

import { ClientGoneError, writeWithBackpressure } from '@/utils/streamWrite';

/** A response double whose socket buffer is full until `drain` is emitted. */
const fakeResponse = (accepts = true) => {
  const res: any = new EventEmitter();
  res.destroyed = false;
  res.writableEnded = false;
  res.write = vi.fn(() => accepts);
  return res;
};

describe('writeWithBackpressure', () => {
  it('resolves at once when the socket accepts the chunk', async () => {
    const res = fakeResponse();
    await writeWithBackpressure(res, 'a');
    expect(res.write).toHaveBeenCalledWith('a');
  });

  it('waits for drain when the buffer is full, then resolves and unhooks', async () => {
    const res = fakeResponse(false);
    let done = false;
    const pending = writeWithBackpressure(res, 'a').then(() => (done = true));
    await Promise.resolve();
    expect(done).toBe(false);
    res.emit('drain');
    await pending;
    expect(res.listenerCount('drain')).toBe(0);
    expect(res.listenerCount('close')).toBe(0);
  });

  it('rejects a pending write when the client disconnects, instead of waiting forever', async () => {
    const res = fakeResponse(false);
    const pending = writeWithBackpressure(res, 'a');
    res.emit('close');
    await expect(pending).rejects.toBeInstanceOf(ClientGoneError);
    expect(res.listenerCount('drain')).toBe(0);
  });

  it('rejects a pending write on a socket error', async () => {
    const res = fakeResponse(false);
    const pending = writeWithBackpressure(res, 'a');
    res.emit('error', new Error('EPIPE'));
    await expect(pending).rejects.toBeInstanceOf(ClientGoneError);
  });

  it('rejects without writing when the response is already destroyed or ended', async () => {
    for (const flag of ['destroyed', 'writableEnded']) {
      const res = fakeResponse();
      res[flag] = true;
      await expect(writeWithBackpressure(res, 'a')).rejects.toBeInstanceOf(
        ClientGoneError,
      );
      expect(res.write).not.toHaveBeenCalled();
    }
  });
});
