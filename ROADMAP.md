# Project Roadmap

**Last Updated**: 2026-01-13
**Status**: Code Review Complete - Fixes Required

---

## Code Review Summary

- **Files Reviewed**: 20+ (modified and new files)
- **Critical Issues**: 1
- **Medium Severity**: 7
- **Low Priority**: 7
- **Overall Assessment**: Needs fixes before production deployment

---

## Issues by Severity

### 🔴 CRITICAL (Must Fix - 1 issue)

#### 1. Event ID Test Mismatch
**File**: `tests/services/eventService.test.ts:822`
**Issue**: Test expects 12-character event IDs but code generates 16-character IDs
**Impact**: Test failures will block deployment
**Fix**: Update regex from `/^evt_[a-f0-9]{12}$/` to `/^evt_[a-f0-9]{16}$/`

---

### 🟡 MEDIUM SEVERITY (Should Fix - 7 issues)

#### 2. Memory Leak Risk in Cache
**File**: `src/commands/catchup.ts:16-27`
**Issue**: `summaryCache` Map can grow unbounded without size limits
**Impact**: Memory exhaustion in long-running processes
**Fix**: Implement MAX_CACHE_SIZE limit with LRU eviction

#### 3. Race Condition in Database Initialization
**File**: `src/db/connection.ts:10-40`
**Issue**: Concurrent calls to `initializeDatabase()` could create multiple pool instances
**Impact**: Resource leaks and connection pool exhaustion
**Fix**: Add initialization lock with Promise tracking

#### 4. Permission Check Logic Error
**File**: `src/services/messageService.ts:134`
**Issue**: Boolean evaluation fails when permissions is null
**Impact**: Users might not see messages from channels they have access to
**Fix**: Change to `Boolean(permissions?.has('ViewChannel') && permissions?.has('ReadMessageHistory'))`

#### 5. Missing Array Parameter Validation
**File**: `src/db/queries.ts:143-205`
**Issue**: Array parameters in SQL queries lack type validation before using `ANY($N)` syntax
**Impact**: Potential SQL injection if arrays come from untrusted sources
**Fix**: Add type validation for array contents before passing to queries

#### 6. Event ID Collision Risk
**File**: `src/services/eventService.ts:261-267`
**Issue**: Using only 16 characters (64 bits) of SHA-256 hash for event IDs
**Impact**: Birthday paradox suggests collision probability increases with scale
**Fix**: Increase to 24 characters (96 bits) for better collision resistance

#### 7. Cache Key Generation Weakness
**File**: `src/commands/catchup.ts:77-78`
**Issue**: Cache key uses `Date.now()` + 4 random bytes, which could theoretically collide
**Impact**: Low probability but possible cache key collision in high-throughput scenarios
**Fix**: Use `crypto.randomUUID()` or increase random bytes to 16

#### 8. Sanitization Bypass Potential
**File**: `src/utils/sanitization.ts:6-27`
**Issue**: Replaces backticks with full-width characters, but Claude might still interpret them
**Impact**: Potential prompt injection if Claude processes full-width backticks as code blocks
**Fix**: Remove code blocks entirely instead of character replacement

---

### 🟢 LOW PRIORITY (Consider Improving - 7 issues)

#### 9. Inconsistent Error Message Format
**Files**: Multiple
**Issue**: Some functions return generic "Unknown error" while others provide context
**Suggestion**: Create standardized error handling utility

#### 10. In-Memory Rate Limiting
**File**: `src/utils/rateLimiter.ts:8`
**Issue**: Rate limits reset when bot restarts
**Suggestion**: Use Redis or database for persistent rate limiting

#### 11. Fragile Cache Key Parsing
**File**: `src/commands/catchup.ts:287-290`
**Issue**: Parsing cache key format with string split is brittle
**Suggestion**: Store timestamp separately in cache value object

#### 12. Query Logging Can Be Enhanced
**File**: `src/db/connection.ts:66-71`
**Issue**: Logs query hash but not query type
**Suggestion**: Add query type (SELECT/INSERT/UPDATE/DELETE) to logs

#### 13. Hard-Coded Confidence Threshold
**File**: `src/services/eventService.ts:116`
**Issue**: Event confidence threshold of 50 is hard-coded
**Suggestion**: Make configurable via environment variable

#### 14. Background Tasks Run Immediately
**File**: `src/index.ts:171-173`
**Issue**: Cleanup and detection tasks run immediately on startup
**Suggestion**: Add delay or check last run time from database

#### 15. Missing Edge Case Tests
**Files**: Various test files
**Issue**: Some edge cases lack test coverage
**Suggestion**: Add tests for concurrent operations, null values, and error paths

---

## Fix Plan

### Phase 1: Critical Fixes (Required Before Merge)
**Timeline**: Immediate
**Status**: Pending

- [ ] **Task 1.1**: Fix event ID regex test mismatch (Critical)
  - Update `tests/services/eventService.test.ts:822`
  - Change regex from `{12}` to `{16}`

---

### Phase 2: Security & Reliability (High Priority)
**Timeline**: Before production deployment
**Status**: Pending

- [ ] **Task 2.1**: Add cache size limit to prevent memory leaks
  - Implement MAX_CACHE_SIZE = 1000
  - Add LRU eviction when limit reached
  - File: `src/commands/catchup.ts`

- [ ] **Task 2.2**: Fix database initialization race condition
  - Add initialization lock mechanism
  - Prevent concurrent pool creation
  - File: `src/db/connection.ts`

- [ ] **Task 2.3**: Fix permission check boolean logic
  - Correct null handling in permission checks
  - File: `src/services/messageService.ts:134`

- [ ] **Task 2.4**: Add array parameter validation in database queries
  - Validate array contents before SQL operations
  - File: `src/db/queries.ts`

---

### Phase 3: Robustness Improvements (Medium Priority)
**Timeline**: Within 1-2 sprints
**Status**: Planned

- [ ] **Task 3.1**: Increase event ID hash length to 24 chars
  - Change from 16 to 24 characters (64 → 96 bits)
  - Update tests accordingly
  - File: `src/services/eventService.ts:261-267`

- [ ] **Task 3.2**: Improve cache key generation with more entropy
  - Replace `Date.now() + 4 bytes` with `crypto.randomUUID()`
  - File: `src/commands/catchup.ts:77-78`

- [ ] **Task 3.3**: Strengthen sanitization to remove code blocks entirely
  - Replace character substitution with complete removal
  - File: `src/utils/sanitization.ts`

---

### Phase 4: Optional Enhancements (Low Priority)
**Timeline**: Future consideration
**Status**: Backlog

- [ ] **Task 4.1**: Create standardized error handling utility
- [ ] **Task 4.2**: Implement persistent rate limiting (Redis/DB)
- [ ] **Task 4.3**: Refactor cache key storage to include metadata
- [ ] **Task 4.4**: Add query type to database logs
- [ ] **Task 4.5**: Make event confidence threshold configurable
- [ ] **Task 4.6**: Add startup delay for background tasks
- [ ] **Task 4.7**: Expand test coverage for edge cases

---

## Security Highlights (What's Already Good)

✅ **Proper use of parameterized queries** - No SQL injection vulnerabilities
✅ **Input sanitization for AI prompts** - Protection against prompt injection
✅ **Rate limiting implemented** - Prevents abuse
✅ **Permission checks for channel access** - Respects Discord permissions
✅ **Graceful error handling throughout** - Good UX and debugging
✅ **Comprehensive test coverage** - Good foundation for CI/CD

---

## Next Steps

1. **Immediate**: Fix Critical Issue #1 (event ID test)
2. **This Week**: Complete Phase 2 (Security & Reliability fixes)
3. **Next Sprint**: Address Phase 3 (Robustness improvements)
4. **Backlog**: Evaluate Phase 4 items based on production metrics

---

## Notes

- All critical and high-priority issues should be addressed before production deployment
- Medium-priority issues are acceptable technical debt if timeline is tight, but should be tracked
- Low-priority items can be deferred to future sprints based on production monitoring

**Review Date**: TBD after Phase 1 & 2 completion
