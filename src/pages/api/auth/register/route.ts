import { genSalt, hash } from "bcrypt";
import type { NextApiRequest, NextApiResponse } from "next";

import prisma from "@/lib/prisma";

export default async function handle(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method === "POST") {
    await handlePOST(res, req);
  } else {
    throw new Error(
      `The HTTP ${req.method} method is not supported at this route.`
    );
  }
}

export async function handlePOST(res: NextApiResponse, req: NextApiRequest) {
  const { email, password, race, display_name } = await req.body;
  try {
    const exists = await prisma.users.findUnique({
      where: {
        email,
      },
    });
   
    if (exists) {
      return res
        .status(400)
        .json({
          success: false,
          message: "User already exists",
          error: "User already exists",
        });
    }
    const salt = await genSalt(10);
    const phash = await hash(password, salt);
    const user = await prisma.users.create({
      data: {
        email,
        password_hash: phash,
        salt,
        display_name,
        race,
        class: req.body.class,
      },
    });
    return res.json({ success: true, user});
  } catch (error) {
    return res
      .status(500)
      .json({ error: error, message: "Something went wrong!", success: false });
  }
}
