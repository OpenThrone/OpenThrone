/** Defender-only historical facts; these never contain a roster or combat inputs. */
export interface DefenseAdvisoryFacts {
  fortBreached: boolean | null;
  civilianLosses: number | null;
  offensiveLosses: number | null;
}

const asRecord = (value: unknown): Record<string, unknown> | null => {
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed
      : null;
  } catch {
    return null;
  }
};

const nonnegativeNumber = (value: unknown): number | null => {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
};

/** Missing/invalid legacy HP must remain unknown, rather than becoming zero. */
export function projectDefenseAdvisoryFacts(
  value: unknown,
): DefenseAdvisoryFacts {
  const stats = asRecord(value) ?? {};
  const start = nonnegativeNumber(stats.forthpAtStart);
  const end = nonnegativeNumber(stats.forthpAtEnd);
  const fortBreached =
    typeof stats.fort_breached === 'boolean'
      ? stats.fort_breached
      : start !== null && end !== null
        ? end === 0
        : null;
  const losses = asRecord(stats.defender_losses);
  let units: unknown = losses?.units;
  try {
    if (typeof units === 'string') units = JSON.parse(units);
  } catch {
    units = null;
  }
  const list = Array.isArray(units)
    ? units
    : units && typeof units === 'object'
      ? Object.values(units)
      : null;
  const sumLosses = (types: string[]): number | null => {
    if (!list) return null;
    let total = 0;
    for (const unit of list) {
      const record = asRecord(unit);
      if (!record || typeof record.type !== 'string') return null;
      if (!types.includes(record.type)) continue;
      const quantity = nonnegativeNumber(record.quantity);
      if (quantity === null) return null;
      total += quantity;
    }
    return total;
  };
  return {
    fortBreached,
    civilianLosses: sumLosses(['CITIZEN', 'WORKER']),
    offensiveLosses: sumLosses(['OFFENSE']),
  };
}

/** Show advice only for the defender's recorded breach and exposed-unit losses. */
export function getDefenseAdvisory(
  value: unknown,
  isViewerDefender: boolean,
): 'civilian' | 'offensive' | 'both' | null {
  if (!isViewerDefender) return null;
  const facts = asRecord(asRecord(value)?.defense_advisory);
  if (facts?.fortBreached !== true) return null;
  const civilians = (nonnegativeNumber(facts.civilianLosses) ?? 0) > 0;
  const offense = (nonnegativeNumber(facts.offensiveLosses) ?? 0) > 0;
  return civilians && offense
    ? 'both'
    : civilians
      ? 'civilian'
      : offense
        ? 'offensive'
        : null;
}
