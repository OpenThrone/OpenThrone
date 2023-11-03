import type { NextAuthOptions } from 'next-auth';
import NextAuth from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import prisma from '@/lib/prisma';

const updateLastActive = async (email: string) => {
  return prisma.users.update({
    where: { email },
    data: { last_active: new Date() },
  });
};

const validateCredentials = async (email: string, password: string) => {
  const user = await prisma.users.findUnique({
    where: {
      email,
    },
  });

  
  const passwordMatches = user && (await Bun.password.verify(password, user.password_hash));

  if (!passwordMatches) {
    throw new Error('Invalid username or password');
  }

  await updateLastActive(email);
  
  const {password_hash, ...rest} = user;
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
    maxAge: 24 * 60 * 60, //30 * 24 * 60 * 60, // 1 day
  },

  // Secret for JWT Signing
  secret: process.env.JWT_SECRET,
  
  callbacks: {
    async session({ session, token }) {
      //console.log('session here: ', session, token)
      try {
        session.user = token.user;
        return session;
      } catch (error) {
        console.error('Session callback error:', error);
        throw error; // Re-throwing the error after logging it will help in identifying the issue
      }
    },
    async jwt({ token, user }) {
      //console.log('jwt here: ', token, user);
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
        //race: { label: 'Race', type: 'text' },
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
