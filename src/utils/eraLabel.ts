/**
 * Short era label for tight spaces (sidebar stats): the number in the era's
 * name ("Era 3" → "3", "Era 2: A New Age" → "2"), which players see everywhere
 * else. The database id is only a fallback; it can run ahead of the era
 * number (#274).
 */
export const getEraNumberLabel = (
  era: { id?: number | null; name?: string | null } | null | undefined,
): string | null => {
  const name = era?.name ?? '';
  const fromName =
    name.match(/\bera\s*(\d+)/i)?.[1] ?? name.match(/(\d+)\s*$/)?.[1];
  if (fromName) return fromName;
  if (era?.name?.trim()) return era.name.trim();
  return era?.id != null ? String(era.id) : null;
};
