// Temporary shims to reduce type noise during migration.
// These are permissive and should be tightened/removed after the migration completes.

declare module 'tiptap-markdown' {
  // Treat the Markdown export as any to avoid duplicate @tiptap/core type conflicts
  const Markdown: any;
  export { Markdown };
  export default Markdown;
}

declare module '@mantine/core' {
  // Relax a few common prop types used across the app during migration.
  // These aliases reduce many prop mismatch errors and should be removed later.
  export type SimpleGridProps = any;
  export type StackProps = any;
  export type GroupProps = any;
  export type TextProps = any;
  export type IntrinsicProps = any;
}

// Widen next-auth Session.user.id to accept number|string to match runtime data
declare module 'next-auth' {
  interface Session {
    user?: {
      id?: string | number;
      alliance_id?: number | string;
      twoFactorEnabled?: boolean;
      // allow other properties
      [key: string]: any;
    };
  }
}

// Add missing DetailedCalculatedStrength properties referenced in utilities
declare global {
  interface DetailedCalculatedStrength {
    MeleeAtkPower: number;
    RangedAtkPower: number;
    MeleeDefPower: number;
    RangedDefPower: number;
    [key: string]: any;
  }
}

export {};

// Provide a permissive `vi` global for Vitest/Bun test environments during migration
declare const vi: any;

// Temporarily widen UserRow shape for permissions access in tests
declare global {
  type UserRow = any;
}

// Provide permissive types for Bun test imports
declare module 'bun:test' {
  export const vi: any;
  export const mock: any;
}
