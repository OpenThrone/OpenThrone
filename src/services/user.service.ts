import md5 from "md5";
import prisma from "@/lib/prisma";

export const createUser = async (email: string, password_hash: string, display_name: string, race: string, class_name: string, locale: string = 'en-US') => {
  return await prisma.$transaction(async (tx) => {
    const user = await tx.users.create({
      data: {
        email,
        password_hash,
        display_name,
        race,
        class: class_name,
        locale,
      },
    });

    await tx.users.update({
      where: { id: user.id },
      data: { recruit_link: md5(user.id.toString()) },
    });

    return user;
  });
}

export const userExists = async (email: string) => {
  return await prisma.users.count({
    where: {
      OR: [
        {
          email: email.toLowerCase()
          
        },
        {
          display_name: {
            equals: email,
            mode: 'insensitive'
          }
          
        }
      ]      
    },
  });
}