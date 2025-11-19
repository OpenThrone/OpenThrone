// Temporary permissive shims to reduce noise during the units migration.
// Keep these minimal to avoid colliding with existing library types.

// Allow the test runner globals used in Vitest/Jest (vi, beforeEach, etc.)
declare const vi: any;
declare const beforeEach: any;
declare const afterEach: any;
declare const describe: any;
declare const it: any;
declare const expect: any;

// Add missing properties to DetailedCalculatedStrength used in utilities.ts
// This is a minimal local shim; ideally the real type should be corrected in-place.
interface DetailedCalculatedStrength {
  MeleeAtkPower?: number;
  RangedAtkPower?: number;
  MeleeDefPower?: number;
  RangedDefPower?: number;
  [key: string]: any;
}
