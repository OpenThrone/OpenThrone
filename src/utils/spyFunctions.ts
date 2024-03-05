export function computeSpyAmpFactor(targetPop: number): number {
  let ampFactor = 0.4;

  const breakpoints = [
    { limit: 10, factor: 1.6 },
    { limit: 9, factor: 1.5 },
    { limit: 7, factor: 1.35 },
    { limit: 5, factor: 1.2 },
    { limit: 3, factor: 0.95 },
    { limit: 1, factor: 0.75 },
  ];

  for (const bp of breakpoints) {
    if (targetPop <= bp.limit) {
      ampFactor *= bp.factor;
      break;
    }
  }

  return ampFactor;

}