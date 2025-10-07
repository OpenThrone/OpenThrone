// Small helper to safely convert various date-like values to ISO strings.
export const safeToISOString = (val: any): string | null => {
  if (val === null || typeof val === 'undefined') return null;
  if (val instanceof Date) return isNaN(val.getTime()) ? null : val.toISOString();
  if (typeof val === 'number') {
    const d = new Date(val);
    return isNaN(d.getTime()) ? null : d.toISOString();
  }
  if (typeof val === 'string') {
    const parsed = Date.parse(val);
    if (isNaN(parsed)) return null;
    const d = new Date(parsed);
    return isNaN(d.getTime()) ? null : d.toISOString();
  }
  return null;
};

export default safeToISOString;