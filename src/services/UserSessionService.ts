import { z } from 'zod';

const UserDataSchema = z.object({
  last_active: z.union([z.date(), z.string(), z.null()]).optional(),
});

/** Encapsulates user session data access and domain operations. */
export class UserSessionService {
  private lastActive: Date | null;

  constructor(userData: { last_active?: Date | string | null } = {}) {
    const validatedData = UserDataSchema.parse(userData);
    this.lastActive = validatedData.last_active
      ? new Date(validatedData.last_active)
      : null;
  }

  isOnline(minutesWindow = 15): boolean {
    if (!this.lastActive) return false;
    const nowTimestamp = Date.now();
    const lastActiveTimestamp = this.lastActive.getTime();
    return (nowTimestamp - lastActiveTimestamp) / (1000 * 60) <= minutesWindow;
  }

  recruitingLink(userId: number): string {
    // Keep this simple; the caller may prefer md5 or other hashing.
    // The original model used md5(userId.toString()) — callers still use the model facade.
    return userId.toString();
  }

  getTimeToNextTurn(date = new Date()): Date {
    const ms = 1800000; // 30 minutes
    return new Date(Math.ceil(date.getTime() / ms) * ms);
  }
}
