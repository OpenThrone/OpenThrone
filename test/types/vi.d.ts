declare module 'bun:test' {
  export const describe: any;
  export const it: any;
  export const test: any;
  export const expect: any;
  export const beforeEach: any;
  export const afterEach: any;
  export const vi: {
    fn: (...args: any[]) => any;
    mock: (mod: string, factory: () => any) => void;
    spyOn: (obj: any, method: string) => any;
    clearAllMocks: () => void;
    useRealTimers: () => void;
  };
}
