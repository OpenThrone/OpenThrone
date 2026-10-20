/**
 * Quantity the Training page's MAX button fills in (#88): whatever is left
 * after everything already queued on the page, in any section, limited by
 * untrained citizens and by gold on hand, whichever runs out first.
 */
export const getMaxTrainableQuantity = (params: {
  /** Untrained citizens the player owns. */
  citizens: number;
  /** Citizens queued for other units anywhere on the page. */
  citizensQueuedElsewhere: number;
  /** Gold on hand. */
  gold: bigint;
  /** Gold queued for other units anywhere on the page. */
  goldQueuedElsewhere: number;
  /** This unit's price as charged (price bonus and discount events applied). */
  unitCost: number;
}): number => {
  if (!(params.unitCost > 0)) return 0;
  const byCitizens = Math.max(
    0,
    Math.floor(params.citizens - params.citizensQueuedElsewhere),
  );
  const goldLeft =
    params.gold - BigInt(Math.max(0, Math.ceil(params.goldQueuedElsewhere)));
  const byGold =
    goldLeft > 0n ? Number(goldLeft / BigInt(Math.ceil(params.unitCost))) : 0;
  const max = Math.min(byCitizens, byGold);
  return Number.isFinite(max) ? max : 0;
};
