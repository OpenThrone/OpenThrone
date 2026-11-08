import type { ServerResponse } from 'http';

/** Thrown when the client went away while a response was being written. */
export class ClientGoneError extends Error {
  constructor() {
    super('The client closed the connection');
    this.name = 'ClientGoneError';
  }
}

/**
 * Writes one chunk and resolves once the socket accepts more. Rejects with
 * ClientGoneError when the response is already closed, or closes or errors
 * while the write is waiting for `drain`, so a generator awaiting it stops
 * instead of staying suspended on a socket that will never drain.
 */
export function writeWithBackpressure(
  res: Pick<
    ServerResponse,
    'write' | 'once' | 'off' | 'destroyed' | 'writableEnded'
  >,
  chunk: string,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (res.destroyed || res.writableEnded) {
      reject(new ClientGoneError());
      return;
    }
    let accepted: boolean;
    try {
      accepted = res.write(chunk);
    } catch {
      reject(new ClientGoneError());
      return;
    }
    if (accepted) {
      resolve();
      return;
    }
    const cleanup = () => {
      res.off('drain', onDrain);
      res.off('close', onGone);
      res.off('error', onGone);
    };
    const onDrain = () => {
      cleanup();
      resolve();
    };
    const onGone = () => {
      cleanup();
      reject(new ClientGoneError());
    };
    res.once('drain', onDrain);
    res.once('close', onGone);
    res.once('error', onGone);
  });
}
