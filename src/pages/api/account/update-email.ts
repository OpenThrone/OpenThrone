import { getSession } from "next-auth/react";
import prisma from "@/lib/prisma"; // Adjust according to your Prisma setup
import { withAuth } from "@/middleware/auth";
import { stringifyObj } from "@/utils/numberFormatting";

const argon2 = require('argon2');

async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = req.session;

  if (!session) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { newEmail, password, verify } = req.body;

  if (!newEmail || !validateEmail(newEmail)) {
    return res.status(400).json({ error: 'Invalid email' });
  }

  try {
    // Check if the email is already in use
    const existingUser = await prisma.users.findUnique({
      where: { email: newEmail },
    });

    if (existingUser) {
      return res.status(409).json({ error: 'Email is already in use' });
    }

    // Check if the verification code is valid
    const existingReset = await prisma.passwordReset.findFirst({
      where: {
        verificationCode: verify,
        status: 0,
        type: 'EMAIL',
        
      },
    });

    if (!existingReset) {
      return res.status(404).json({ error: 'Invalid verification code' });
    }

    console.log('existingReset:', existingReset);

    // Check if the password is correct
    const user = await prisma.users.findFirst({
      where: { id: existingReset.userId },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const passwordMatch = await argon2.verify(user.password_hash, password);
    if (!passwordMatch) {
      return res.status(401).json({ error: 'Invalid password' });
    }

    // Update the user's email
    const updatedUser = await prisma.users.update({
      where: { id: session.user.id },
      data: { email: newEmail },
    });

    // Mark the PasswordReset record as used or remove it
    await prisma.passwordReset.updateMany({
      where: {
        userId: session.user.id,
        type: 'EMAIL',
        status: 0,
      },
      data: { status: 1 },
    });

    return res.status(200).json({ message: 'Email updated successfully' });
  } catch (error) {
    return res.status(409).json({ error });
  }
}

// Utility function to validate email format
function validateEmail(email) {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(String(email).toLowerCase());
}

export default withAuth(handler);
