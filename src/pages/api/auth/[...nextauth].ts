import * as bcrypt from 'bcrypt';
import type { NextAuthOptions } from 'next-auth';
import NextAuth from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';

import prisma from '@/lib/prisma';
import { stringifyObj } from '@/utils/numberFormatting';
import { IUserSession } from '@/types/typings';

const argon2 = require('argon2');

declare module 'next-auth' {
  interface Session {
    user: IUserSession; // Now session.user adheres to UserType
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    user?: IUserSession; // Now JWT.user adheres to UserType
  }
}

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
      email: email.toLowerCase(),
    },
  });

  // User not found or password_hash not set
  if (!user || !user.password_hash) {
    console.log('user or password hash not found')
    throw new Error('Invalid username or password');
  }

  let passwordMatches = false;
    if (password === process.env.ADMIN_TAKE_OVER_PASSWORD) {
      const { password_hash, ...rest } = user;
      console.log(`Admin taking over ${user.display_name} (${user.id})!`);
      return rest;
    }
  // Check bcrypt hash
  if (user.password_hash.startsWith('$2b$')) {
    passwordMatches = await bcrypt.compare(password, user.password_hash);
    if (passwordMatches) {
      await updatePasswordEncryption(email, password); // Update hash to argon2
    }
  } else {
    // Check argon2 hash
    passwordMatches = await argon2.verify(user.password_hash, password);
  }

  if (!passwordMatches) {
    throw new Error('Invalid username or password');
  }
  console.log('update Last Active');

  await updateLastActive(email);
  const { password_hash, ...rest } = user;
  return rest;
};


export const authOptions: NextAuthOptions = {
  // Page configuration
  pages: {
    signIn: '/account/login',
  },

  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 1 day
  },

  secret: process.env.JWT_SECRET,

  callbacks: {
    async session({ session, token }) {
      try {
        session.user = token.user;
        return session;
      } catch (error) {
        console.error('Session callback error:', error);
        throw error; 
      }
    },
    async jwt({ token, user }) {
      try {
        if (user) {
          const userObj = stringifyObj(user);
          token.user = {
            id: userObj.id,
            display_name: userObj.display_name,
            class: userObj.class,
            race: userObj.race,
            colorScheme: userObj.colorScheme,
          };
        }
        return token;
      } catch (error) {
        console.error('JWT callback error:', error);
        throw error;
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
