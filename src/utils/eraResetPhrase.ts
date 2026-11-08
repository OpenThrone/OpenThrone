/**
 * Typed confirmation for the admin era resets. The ordinary reset keeps
 * alliances (they become RESERVED); only the explicit complete factory restore
 * dissolves them (#13), and it has its own phrase so one cannot be confused
 * for the other.
 */
export const eraResetPhrase = (
  eraId: number,
  factoryRestore = false,
): string =>
  factoryRestore ? `FACTORY RESTORE ERA ${eraId}` : `RESET ERA ${eraId}`;
