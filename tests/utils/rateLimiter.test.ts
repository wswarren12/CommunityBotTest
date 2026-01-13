import {
  checkRateLimit,
  getRemainingRequests,
  getTimeUntilReset,
  cleanupExpiredLimits,
  resetRateLimits,
} from '../../src/utils/rateLimiter';

describe('Rate Limiter', () => {
  const testUserId = 'test-user-123';
  const maxPerHour = 5;

  beforeEach(() => {
    // Reset all rate limits before each test
    resetRateLimits();
  });

  describe('checkRateLimit', () => {
    it('should allow first request', () => {
      const result = checkRateLimit(testUserId, maxPerHour);
      expect(result).toBe(true);
    });

    it('should allow requests up to limit', () => {
      // Make 5 requests (the limit)
      for (let i = 0; i < maxPerHour; i++) {
        const result = checkRateLimit(testUserId, maxPerHour);
        expect(result).toBe(true);
      }
    });

    it('should block requests exceeding limit', () => {
      // Use up the limit
      for (let i = 0; i < maxPerHour; i++) {
        checkRateLimit(testUserId, maxPerHour);
      }

      // Next request should be blocked
      const result = checkRateLimit(testUserId, maxPerHour);
      expect(result).toBe(false);
    });

    it('should track different users independently', () => {
      const user1 = 'user-1';
      const user2 = 'user-2';

      // User 1 uses all their requests
      for (let i = 0; i < maxPerHour; i++) {
        checkRateLimit(user1, maxPerHour);
      }

      // User 1 should be blocked
      expect(checkRateLimit(user1, maxPerHour)).toBe(false);

      // User 2 should still be allowed
      expect(checkRateLimit(user2, maxPerHour)).toBe(true);
    });

    it('should use default limit when not specified', () => {
      // Default is 10
      for (let i = 0; i < 10; i++) {
        expect(checkRateLimit(testUserId)).toBe(true);
      }

      // 11th request should fail with default limit
      expect(checkRateLimit(testUserId)).toBe(false);
    });
  });

  describe('getRemainingRequests', () => {
    it('should return max when no requests made', () => {
      const remaining = getRemainingRequests(testUserId, maxPerHour);
      expect(remaining).toBe(maxPerHour);
    });

    it('should decrease after each request', () => {
      checkRateLimit(testUserId, maxPerHour);
      let remaining = getRemainingRequests(testUserId, maxPerHour);
      expect(remaining).toBe(maxPerHour - 1);

      checkRateLimit(testUserId, maxPerHour);
      remaining = getRemainingRequests(testUserId, maxPerHour);
      expect(remaining).toBe(maxPerHour - 2);
    });

    it('should return 0 when limit reached', () => {
      // Use up all requests
      for (let i = 0; i < maxPerHour; i++) {
        checkRateLimit(testUserId, maxPerHour);
      }

      const remaining = getRemainingRequests(testUserId, maxPerHour);
      expect(remaining).toBe(0);
    });
  });

  describe('getTimeUntilReset', () => {
    it('should return 0 for user with no limits', () => {
      const time = getTimeUntilReset('new-user');
      expect(time).toBe(0);
    });

    it('should return time in seconds after first request', () => {
      checkRateLimit(testUserId, maxPerHour);
      const time = getTimeUntilReset(testUserId);

      // Should be close to 3600 seconds (1 hour)
      expect(time).toBeGreaterThan(3590);
      expect(time).toBeLessThanOrEqual(3600);
    });

    it('should decrease over time', async () => {
      checkRateLimit(testUserId, maxPerHour);
      const time1 = getTimeUntilReset(testUserId);

      // Wait 1 second to ensure measurable time difference
      await new Promise((resolve) => setTimeout(resolve, 1100));

      const time2 = getTimeUntilReset(testUserId);

      // Time should have decreased by at least 1 second
      expect(time2).toBeLessThanOrEqual(time1 - 1);
      expect(time2).toBeGreaterThan(0);
    });
  });

  describe('cleanupExpiredLimits', () => {
    it('should not affect active limits', () => {
      checkRateLimit(testUserId, maxPerHour);

      cleanupExpiredLimits();

      // Limit should still be active
      const remaining = getRemainingRequests(testUserId, maxPerHour);
      expect(remaining).toBe(maxPerHour - 1);
    });

    // Note: Testing expired limits cleanup would require mocking time
    // or waiting 1 hour, which is impractical for unit tests
  });

  describe('Edge cases', () => {
    it('should handle limit of 1', () => {
      const limit = 1;
      expect(checkRateLimit(testUserId, limit)).toBe(true);
      expect(checkRateLimit(testUserId, limit)).toBe(false);
    });

    it('should handle very large limits', () => {
      const limit = 1000;
      for (let i = 0; i < 100; i++) {
        expect(checkRateLimit(testUserId, limit)).toBe(true);
      }
      const remaining = getRemainingRequests(testUserId, limit);
      expect(remaining).toBe(900);
    });

    it('should handle rapid concurrent requests', () => {
      const results = [];
      for (let i = 0; i < maxPerHour + 2; i++) {
        results.push(checkRateLimit(testUserId, maxPerHour));
      }

      // First maxPerHour should be true, rest false
      expect(results.slice(0, maxPerHour)).toEqual(new Array(maxPerHour).fill(true));
      expect(results.slice(maxPerHour)).toEqual([false, false]);
    });
  });
});
