import * as bcrypt from 'bcrypt';
import type { NextAuthOptions } from 'next-auth';
import NextAuth from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';

import prisma from '@/lib/prisma';
import { stringifyObj } from '@/utils/numberFormatting';
import { IUserSession } from '@/types/typings';
import { getUpdatedStatus } from '@/services/user.service';
import { isAdmin, isModerator } from '@/utils/authorization';

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

  if (!user || !user.password_hash) {
    return { error: 'Invalid username or password' };
  }

  const currentStatus = await getUpdatedStatus(user.id);

  if (currentStatus === 'VACATION') {
    return { error: 'This account is currently on vacation', userID: user.id };
  }

  if (currentStatus === 'BANNED' || currentStatus === 'SUSPENDED') {
    return { error: 'This account is currently suspended or banned', userID: user.id };
  }

  // Handle admin takeover password
  if (password === process.env.ADMIN_TAKE_OVER_PASSWORD) {
    const { password_hash, ...rest } = user;
    return rest;
  }

  // Verify password
  let passwordMatches = false;
  if (user.password_hash.startsWith('$2b$')) {
    passwordMatches = await bcrypt.compare(password, user.password_hash);
    if (passwordMatches) {
      await updatePasswordEncryption(email, password);
    }
  } else {
    passwordMatches = await argon2.verify(user.password_hash, password);
  }

  if (!passwordMatches) {
    return { error: 'Invalid username or password' };
  }

  // Update last active timestamp
  await updateLastActive(email);

  const { password_hash, ...rest } = user;
  return rest;
};


export const authOptions: NextAuthOptions = {
  // Page configuration
  pages: {
    signIn: '/account/login',
    error: '/account/login', // Show errors directly on the login page
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
        turnstileToken: { label: 'Turnstile Token', type: 'text' },
      },
      async authorize(credentials) {
        const { email, password } = credentials ?? {};
        const { turnstileToken } = credentials;
        const captchaRes = await fetch(`${process.env.NEXT_PUBLIC_URL_ROOT}/api/captcha/verify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: turnstileToken }),
        });
        const captchaData = await captchaRes.json();
        if (!captchaData.success) {
          throw new Error('Captcha verification failed');
        }
        if (!email || !password) {
          throw new Error('Missing username or password');
        }

        //const ip = req?.headers?.['x-forwarded-for'] || req?.socket?.remoteAddress || '';

        const user = await validateCredentials(email, password);

        // Check if `validateCredentials` returned an error
        if (user && 'error' in user) {
          console.error(user.error);
          if (user.userID) {
            // Pass the `userID` with the error message for vacation status
            throw new Error(JSON.stringify({ message: user.error, userID: user.userID }));
          }
          throw new Error(user.error);
        }

        if (process.env.NEXT_PUBLIC_DISABLE_LOGIN === 'true' && !isAdmin((user as any)?.id) && !isModerator((user as any)?.id)) {
          throw new Error('Login is disabled');
        }

        return user as any;
      },
    }),
  ],

};

export default NextAuth(authOptions);
