export class UserSessionService {
  private lastActive: Date | null;

  constructor(userData: { last_active?: Date | string | null } = {}) {
    this.lastActive = userData.last_active ? new Date(userData.last_active) : null;
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