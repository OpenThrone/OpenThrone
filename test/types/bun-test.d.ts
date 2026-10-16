// Richer typings for Bun/Vitest-style test globals used in the repo.
// These strike a balance between safety and flexibility: they provide
// useful signatures for `vi` / `vi.fn()` / `vi.spyOn()` while remaining
// permissive enough for tests that dynamically mock things.

// Mock function metadata commonly used in tests
declare interface ViMockMeta {
  calls: any[][];
  instances: any[];
  results: Array<{ type: string; value?: any }>;
}

// Basic shape of a mocked function returned by `vi.fn()` or `vi.spyOn()`.
declare interface ViMockFn<
  T extends (...args: any[]) => any = (...args: any[]) => any,
> {
  (...args: Parameters<T>): ReturnType<T>;
  // chaining-style setters
  mockImplementation(impl: T): this;
  mockImplementationOnce(impl: T): this;
  mockReturnValue(v: ReturnType<T>): this;
  mockReturnValueOnce(v: ReturnType<T>): this;
  mockResolvedValue(v: Awaited<ReturnType<T>>): this;
  mockResolvedValueOnce(v: Awaited<ReturnType<T>>): this;
  mockRejectedValue(err: any): this;
  mockRejectedValueOnce(err: any): this;

  // reset/clear helpers
  mockClear(): void;
  mockReset(): void;
  mockRestore(): void;

  // metadata (call tracking)
  mock: ViMockMeta;
}

declare interface ViMock {
  // create a mock function
  fn: <T extends (...args: any[]) => any = (...args: any[]) => any>(
    impl?: T,
  ) => ViMockFn<T>;

  // module mocking
  mock(id: string, factory: () => any): void;
  importActual(id: string): any;

  // spy on an object method; the returned mock preserves the function signature
  spyOn: <O extends object, K extends keyof O>(
    obj: O,
    method: K,
  ) => ViMockFn<Extract<O[K], Function>>;

  // global mock lifecycle helpers
  clearAllMocks(): void;
  resetAllMocks(): void;
  restoreAllMocks(): void;

  // timer helpers (common usage)
  useFakeTimers(mode?: 'modern' | 'legacy'): void;
  useRealTimers(): void;
  setSystemTime(t: number | Date): void;
  advanceTimersByTime(ms: number): void;
  runOnlyPendingTimers(): void;
  runAllTimers(): void;
}

declare const vi: ViMock;

// Expose the common Bun test globals used by the repository. Keep the
// exported types permissive for `expect` because the project uses the
// runtime test runner's assertion types; we don't need to replicate them here.
declare module 'bun:test' {
  export const describe: (desc: string, fn: () => void) => void;
  export const it: (desc: string, fn: () => any) => void;
  export const test: (desc: string, fn: () => any) => void;
  export const expect: any;
  export const beforeEach: (fn: () => any) => void;
  export const afterEach: (fn: () => any) => void;
  export const vi: ViMock;
}

export {};
