import { describe, expect, it } from 'bun:test';

import { resolveUpgradeTab, UPGRADE_TABS } from '@/utils/upgradeTabs';

describe('resolveUpgradeTab (#348)', () => {
  it('keeps every real tab', () => {
    for (const tab of UPGRADE_TABS) expect(resolveUpgradeTab(tab)).toBe(tab);
  });
  it('sends the old Clandestine URL to the Intel tab', () => {
    expect(resolveUpgradeTab('clandestine')).toBe('intel');
  });
  it('never leaves an unknown tab blank', () => {
    expect(resolveUpgradeTab('nonsense')).toBe('fortifications');
    expect(resolveUpgradeTab(undefined)).toBe('fortifications');
  });
});
