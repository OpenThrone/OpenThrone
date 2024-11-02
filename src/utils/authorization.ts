export const isAdmin = async (userId: number): Promise<boolean> => {
  const adminUser = await prisma.permissionGrant.findFirst({
    where: {
      user_id: userId,
      type: 'ADMINISTRATOR',
    },
  });
  return !!adminUser;
};