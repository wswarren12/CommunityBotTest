import { logger } from './logger';

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const userLimits = new Map<string, RateLimitEntry>();

/**
 * Check if user is within rate limit
 * @returns true if allowed, false if rate limited
 */
export function checkRateLimit(userId: string, maxPerHour: number = 10): boolean {
  const now = Date.now();
  const entry = userLimits.get(userId);

  // No entry or expired - allow and create new entry
  if (!entry || now > entry.resetAt) {
    userLimits.set(userId, {
      count: 1,
      resetAt: now + 60 * 60 * 1000, // 1 hour from now
    });
    return true;
  }

  // Check if within limit
  if (entry.count < maxPerHour) {
    entry.count++;
    return true;
  }

  // Rate limited
  logger.warn('User rate limited', { userId, count: entry.count });
  return false;
}

/**
 * Get remaining requests for user
 */
export function getRemainingRequests(userId: string, maxPerHour: number = 10): number {
  const entry = userLimits.get(userId);
  if (!entry || Date.now() > entry.resetAt) {
    return maxPerHour;
  }
  return Math.max(0, maxPerHour - entry.count);
}

/**
 * Get time until reset (in seconds)
 */
export function getTimeUntilReset(userId: string): number {
  const entry = userLimits.get(userId);
  if (!entry) return 0;

  const remaining = Math.max(0, entry.resetAt - Date.now());
  return Math.ceil(remaining / 1000);
}

/**
 * Clean up expired entries (run periodically)
 */
export function cleanupExpiredLimits(): void {
  const now = Date.now();
  let cleaned = 0;

  for (const [userId, entry] of userLimits.entries()) {
    if (now > entry.resetAt) {
      userLimits.delete(userId);
      cleaned++;
    }
  }

  if (cleaned > 0) {
    logger.debug('Cleaned up expired rate limits', { count: cleaned });
  }
}

// Cleanup interval management
let cleanupIntervalId: NodeJS.Timeout | null = null;

/**
 * Start rate limit cleanup interval
 */
export function startRateLimitCleanup(): void {
  if (cleanupIntervalId) {
    logger.warn('Rate limit cleanup already running');
    return;
  }

  cleanupIntervalId = setInterval(cleanupExpiredLimits, 10 * 60 * 1000); // Every 10 minutes
  logger.info('Rate limit cleanup started');
}

/**
 * Stop rate limit cleanup interval
 */
export function stopRateLimitCleanup(): void {
  if (cleanupIntervalId) {
    clearInterval(cleanupIntervalId);
    cleanupIntervalId = null;
    logger.info('Rate limit cleanup stopped');
  }
}

/**
 * Reset all rate limits (for testing only)
 */
export function resetRateLimits(): void {
  userLimits.clear();
}
