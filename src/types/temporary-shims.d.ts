// Temporary permissive shims to reduce noise during the units migration.
// Keep these minimal to avoid colliding with existing library types.

// Allow the test runner globals used in Vitest/Jest (vi, beforeEach, etc.)
declare const vi: any;
declare const beforeEach: any;
declare const afterEach: any;
declare const describe: any;
declare const it: any;
declare const expect: any;
