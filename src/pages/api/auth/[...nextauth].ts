import { compare } from 'bcrypt';
import type { NextAuthOptions } from 'next-auth';
import NextAuth from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';

import prisma from '@/lib/prisma';

const updateLastActive = async (email: string) => {
  return prisma.users.update({
    where: { email },
    data: { last_active: new Date().toISOString() },
  });
};

const validateCredentials = async (email: string, password: string) => {
  const user = await prisma.users.findUnique({
    where: {
      email,
    },
  });
  const passwordMatches = user && (await compare(password, user.password_hash));

  if (!passwordMatches) {
    throw new Error('Invalid username or password');
  }

  await updateLastActive(email);
  return user;
};

export const authOptions: NextAuthOptions = {
  pages: {
    signIn: '/account/login',
  },
  secret: process.env.JWT_SECRET,
  callbacks: {
    async session({ session, token }) {
      const email = token?.user?.email;
      await updateLastActive(email);
      session.accessToken = token.accessToken;
      session.user.id = token.id;
      session.display_name = token.display_name;
      session.race = token.race;
      session.player = token.user;
      return session;
    },
    async jwt({ token, account, user }) {
      if (account) {
        token.accessToken = account.access_token;
        token.id = account.id;
        token.display_name = user.display_name;
        token.race = user.race;
        token.user = user;
      }
      return token;
    },
  },
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
        return validateCredentials(email, password);
      },
    }),
  ],
};

export default NextAuth(authOptions);
