// types/next-auth.d.ts
import 'next-auth';

// Extend the built-in session types
declare module 'next-auth' {
  /**
   * The shape of the user object returned in the session.
   * Extend it to include the fields returned by your backend.
   */
  interface User {
    id: string|number; // Add the `id` field or any other fields you need
  }

  // Extend the session interface to include the custom user type
  interface Session {
    user: User;
  }
}