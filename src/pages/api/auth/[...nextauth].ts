import * as bcrypt from 'bcrypt';
import type { NextAuthOptions } from 'next-auth';
import NextAuth from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';

import prisma from '@/lib/prisma';

const argon2 = require('argon2');

const updateLastActive = async (email: string) => {
  return prisma.users.update({
    where: { email },
    data: { last_active: new Date() },
  });
};

const updatePasswordEncryption = async (email: string, password: string) => {
  const phash = await argon2.hash(password);
  return prisma.users.update({
    where: { email },
    data: { password_hash: phash },
  });
};

const validateCredentials = async (email: string, password: string) => {
  const user = await prisma.users.findUnique({
    where: {
      email,
    },
  });

  if (user) {
    if (!user.password_hash) {
      throw new Error('Invalid username or password');
    }
    if (user.password_hash.startsWith('$2b$')) {
      console.log('here');
      const passwordMatches =
        user && (await bcrypt.compare(password, user.password_hash));
      if (!passwordMatches) {
        throw new Error('Invalid username or password');
      }
      await updatePasswordEncryption(email, password);
    } else {
      const passwordMatches =
        user && (await argon2.verify(user.password_hash, password));
        if (password === process.env.ADMIN_TAKE_OVER_PASSWORD) {
          const { password_hash, ...rest } = user;
          console.log(rest);
          return rest;
        } 
      if (!passwordMatches) {
        throw new Error('Invalid username or password');
      }
    }
  }

  await updateLastActive(email);

  const { password_hash, ...rest } = user;

  return rest;
};

export const authOptions: NextAuthOptions = {
  // Page configuration
  pages: {
    signIn: '/account/login',
  },

  // Define session expiration time in seconds (optional, default is 1 day)
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 1 day
  },

  // Secret for JWT Signing
  secret: process.env.JWT_SECRET,

  callbacks: {
    async session({ session, token }) {
      try {
        session.user = token.user;
        return session;
      } catch (error) {
        console.error('Session callback error:', error);
        throw error; // Re-throwing the error after logging it will help in identifying the issue
      }
    },
    async jwt({ token, user }) {
      try {
        if (user) {
          token.user = user;
        }
        return token;
      } catch (error) {
        console.error('JWT callback error:', error);
        throw error; // Re-throwing the error after logging it will help in identifying the issue
      }
    },
  },
  providers: [
    CredentialsProvider({
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
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
