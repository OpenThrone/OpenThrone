import { logError } from '@/utils/logger';

// Options for the rate limiter
interface RateLimiterOptions {
  windowMs: number; // The time window in milliseconds
  max: number;      // The maximum number of requests allowed in the window
}

// Store for tracking request timestamps for each user
const userRequestTimestamps = new Map<string, number[]>();

/**
 * A simple in-memory rate limiter.
 *
 * @param key - A unique identifier for the user or socket.
 * @param options - The rate limiting options (windowMs, max).
 * @returns - True if the request is allowed, false otherwise.
 */
export const rateLimiter = (key: string, options: RateLimiterOptions): boolean => {
  const { windowMs, max } = options;
  const now = Date.now();

  // Get the user's request timestamps, or initialize if not present
  if (!userRequestTimestamps.has(key)) {
    userRequestTimestamps.set(key, []);
  }
  const timestamps = userRequestTimestamps.get(key)!;

  // Remove timestamps that are outside the current window
  const updatedTimestamps = timestamps.filter(
    (timestamp) => timestamp > now - windowMs
  );

  // If the number of requests is under the max, allow it
  if (updatedTimestamps.length < max) {
    updatedTimestamps.push(now);
    userRequestTimestamps.set(key, updatedTimestamps);
    return true;
  }

  // Otherwise, deny the request
  logError(`Rate limit exceeded for key: ${key}`);
  return false;
};