export const isAdmin = async (userId: number): Promise<boolean> => {
  const adminUser = await prisma.permissionGrant.findFirst({
    where: {
      user_id: userId,
      type: 'ADMINISTRATOR',
    },
  });
  return !!adminUser;
};

export const isModerator = async (userId: number): Promise<boolean> => {
  const moderatorUser = await prisma.permissionGrant.findFirst({
    where: {
      user_id: userId,
      type: 'MODERATOR',
    },
  });
  return !!moderatorUser;
}