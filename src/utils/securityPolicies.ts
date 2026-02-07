const FALSE_VALUES = new Set(['0', 'false', 'no', 'off']);

export const isPrivileged2FAEnforced = () => {
  const raw = process.env.OT_ENFORCE_PRIVILEGED_2FA;
  if (!raw) {
    return true;
  }
  return !FALSE_VALUES.has(raw.trim().toLowerCase());
};
