export function normUnits(units: Array<any> = []) {
  return units.map((u: any) => ({
    id: u.id ?? 0,
    userId: u.userId ?? 0,
    isMercenary: u.isMercenary ?? false,
    ...u,
  }));
}

export function normItems(items: Array<any> = []) {
  return items.map((i: any) => ({
    id: i.id ?? 0,
    userId: i.userId ?? 0,
    ...i,
  }));
}

export function normBattleUpgrades(upgrades: Array<any> = []) {
  return upgrades.map((u: any) => ({
    id: u.id ?? 0,
    userId: u.userId ?? 0,
    ...u,
  }));
}
