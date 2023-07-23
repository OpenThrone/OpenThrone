import { compare } from 'bcrypt';
import { randomBytes, randomUUID } from 'crypto';
import type { NextAuthOptions } from 'next-auth';
import NextAuth from 'next-auth/next';
import CredentialsProvider from 'next-auth/providers/credentials';

import prisma from '@/lib/prisma';
import type UserModel from '@/models/Users';

export const authOptions: NextAuthOptions = {
  session: {
    jwt: true,
    strategy: 'jwt',
    // Seconds - How long until an idle session expires and is no longer valid.
    maxAge: 30 * 24 * 60 * 60, // 30 days

    // Seconds - Throttle how frequently to write to database to extend a session.
    // Use it to limit write operations. Set to 0 to always update the database.
    // Note: This option is ignored if using JSON Web Tokens
    updateAge: 24 * 60 * 60, // 24 hours

    // The session token is usually either a random UUID or string, however if you
    // need a more customized session token string, you can define your own generate function.
    generateSessionToken: () => {
      return randomUUID?.() ?? randomBytes(32).toString('hex');
    },
  },
  jwt: {
    maxAge: 60 * 60 * 24 * 30,
  },
  secret: process.env.JWT_SECRET,
  callbacks: {
    async session({ session, token }) {
      // Send properties to the client, like an access_token and user id from a provider.
      session.accessToken = token.accessToken;
      session.user.id = token.id;
      session.display_name = token.display_name;
      session.race = token.race;
      const user: UserModel = await prisma.users.findUnique({
        where: {
          email: token.email,
        },
      });
      session.player = user;
      return session;
    },
    async jwt({ token, account, user }) {
      // Persist the OAuth access_token and or the user id to the token right after signin
      if (account) {
        token.accessToken = account.access_token;
        token.id = account.id;
        token.display_name = user.display_name;
        token.race = user.race;
      }
      return token;
    },
  },
  debug: true,
  providers: [
    CredentialsProvider({
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
        race: { label: 'Race', type: 'text' },
      },

      async authorize(credentials) {
        const { email, password } = credentials ?? {};
        if (!email || !password) {
          throw new Error('Missing username or password');
        }
        const user = await prisma.users.findUnique({
          where: {
            email,
          },
        });
        // if user doesn't exist or password doesn't match
        if (!user || !(await compare(password, user.password_hash))) {
          throw new Error('Invalid username or password');
        }
        await prisma.users.update({
          where: { email },
          data: { last_active: new Date().toISOString() },
        });
        return user;
      },
    }),
  ],
};

const handler = NextAuth(authOptions);
export default handler;
