import { NextApiRequest, NextApiResponse } from 'next';
import prisma from '@/lib/prisma';
import { withAuth } from '@/middleware/auth';
import { isAdmin } from '@/utils/authorization';
import { logDebug, logError } from '@/utils/logger';
import { PermissionType } from '@prisma/client';
import { stringifyObj } from '@/utils/numberFormatting';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = req.session;
  const { userId } = req.query;

  // Check admin authorization
  if (!session || !session.user || !(await isAdmin(session.user.id))) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Parse userId to number
  const userIdNum = parseInt(userId as string, 10);
  if (isNaN(userIdNum)) {
    return res.status(400).json({ error: 'Invalid user ID' });
  }

  // GET - Fetch user details
  if (req.method === 'GET') {
    try {
      // Fetch basic user data
      const user = await prisma.users.findUnique({
        where: { id: userIdNum },
        include: {
          // Get permissions if they exist in schema
          permissions: {
            select: { type: true }
          }
        }
      });

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Format the response
      const formattedResponse = {
        profile: {
          id: user.id.toString(),
          username: user.display_name,
          email: user.email,
          status: 'ACTIVE', // Default status if not available
          lastActive: user.last_active,
          joinDate: user.created_at,
        },
        stats: {
          gold: user?.gold.toString() || 0,
          experience: user?.experience || 0,
          goldInBank: user?.gold_in_bank.toString() || 0,
        },
        army: {
          units: user.units ? JSON.parse(JSON.stringify(user.units)).map(unit => ({
            id: unit.type,
            name: unit.type,
            quantity: unit.quantity || 0,
            level: unit.level || 1,
            type: unit.type, // Preserve type field
          })) : []
        },
        items: {
          items: user.items ? JSON.parse(JSON.stringify(user.items)).map(item => ({
            id: item.type,
            name: item.type,
            quantity: item.quantity || 0,
            level: item.level || undefined,
            type: item.type, // Preserve type field
            usage: item.usage, // Preserve usage field
          })) : []
        },
        permissions: {
          permissions: user.permissions?.map(p => p.type) || []
        }
      };

      res.status(200).json(formattedResponse);
    } catch (error) {
      logError('Error fetching user details:', error);
      res.status(500).json({ error: 'Failed to fetch user details' });
    }
  }
  // PUT - Update user
  else if (req.method === 'PUT') {
    try {
      const updateData = req.body;
      
      // Start a transaction for updating multiple tables
      await prisma.$transaction(async (tx) => {
        // Fetch current user data to update JSON fields
        const user = await tx.users.findUnique({
          where: { id: userIdNum }
        });
        
        if (!user) {
          throw new Error('User not found');
        }

        // Update profile
        await tx.users.update({
          where: { id: userIdNum },
          data: {
            display_name: updateData.profile.username,
            email: updateData.profile.email,
          }
        });
        
        // Parse current units and items
        const currentUnits = user.units ? JSON.parse(JSON.stringify(user.units)) : [];
        const currentItems = user.items ? JSON.parse(JSON.stringify(user.items)) : [];
        
        // Update units
        // Process each unit from the update data
        for (const unit of updateData.army.units) {
          // Parse the unit id to extract type and level
          // Expected format: "CITIZEN", "WORKER", etc.
          const type = unit.type || unit.id;
          
          // Find the unit in current units array
          const unitIndex = currentUnits.findIndex(u => u.type === type);
          
          if (unitIndex >= 0) {
            // Update existing unit
            currentUnits[unitIndex].quantity = unit.quantity;
            currentUnits[unitIndex].level = unit.level;
          } else {
            // Add new unit
            currentUnits.push({
              type: type,
              level: unit.level,
              quantity: unit.quantity
            });
          }
        }
        
        // Update items
        for (const item of updateData.items.items) {
          // Parse the item id to extract type, usage, and level
          // Expected format: "WEAPON", "ARMOR", etc.
          const type = item.type || item.id;
          const usage = item.usage || 'GENERAL';
          
          // Find the item in current items array
          const itemIndex = currentItems.findIndex(i => i.type === type);
          
          if (itemIndex >= 0) {
            // Update existing item
            currentItems[itemIndex].quantity = item.quantity;
            if (item.level !== undefined) currentItems[itemIndex].level = item.level;
          } else {
            // Add new item
            currentItems.push({
              type: type,
              level: item.level,
              quantity: item.quantity,
              usage: usage
            });
          }
        }
        
        // Update the user with the modified JSON fields
        await tx.users.update({
          where: { id: userIdNum },
          data: {
            units: currentUnits,
            items: currentItems,
            gold: BigInt(updateData.stats.gold),
            experience: updateData.stats.experience,
            rank: updateData.stats.level
          }
        });
        
        // Update permissions - first delete all existing ones
        await tx.permissionGrant.deleteMany({
          where: { user_id: userIdNum }
        });
        
        // Then add the current ones
        for (const permission of updateData.permissions.permissions) {
          await tx.permissionGrant.create({
            data: {
              user_id: userIdNum,
              type: permission
            }
          });
        }
      });
      
      res.status(200).json({ message: 'User updated successfully' });
    } catch (error) {
      logError('Error updating user:', error);
      res.status(500).json({ error: 'Failed to update user' });
    }
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
}

export default withAuth(handler);