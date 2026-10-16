import 'next';

declare module 'next' {
  // Augment NextApiRequest with session info used in the app (optional)
  interface NextApiRequest {
    // session is provided by the session middleware in runtime; tests may set it manually
    session?: any;
    // user shorthand for convenience in some handlers
    user?: any;
  }
}
