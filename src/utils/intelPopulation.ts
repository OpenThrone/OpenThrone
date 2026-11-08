type IntelUnitLists = {
  units?: unknown[] | null;
  mercenaries?: unknown[] | null;
} | null;

/**
 * A mission observed the population when it sampled the unit roster, or
 * when it sampled hired mercenaries that actually exist. An empty mercenary
 * list on its own says nothing about the kingdom's population.
 */
export function isPopulationObserved(intel: IntelUnitLists | undefined) {
  if (!intel) return false;
  if (Array.isArray(intel.units)) return true;
  return Array.isArray(intel.mercenaries) && intel.mercenaries.length > 0;
}
