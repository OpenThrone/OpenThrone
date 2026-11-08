/**
 * Deterministic advisory-lock key for one cheat-signal identity: FNV-1a
 * 64-bit over the identity string, rendered as a signed bigint string for
 * pg_advisory_xact_lock. A hash collision only over-serializes two unrelated
 * signals for a moment; it never under-serializes one, which is all the
 * dedupe needs.
 */
export const cheatSignalIdentityLockKey = (identity: string): string => {
  let hash = 0xcbf29ce484222325n; // FNV-1a offset basis
  for (let index = 0; index < identity.length; index += 1) {
    // eslint-disable-next-line no-bitwise -- FNV-1a XOR step over the byte
    hash ^= BigInt(identity.charCodeAt(index));
    hash = BigInt.asUintN(64, hash * 0x100000001b3n); // FNV-1a prime
  }
  return BigInt.asIntN(64, hash).toString();
};
