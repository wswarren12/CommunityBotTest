# Phase 1 Integration Test Plan

**Date Created:** 2026-01-12
**Test Environment:** Staging
**Critical Fixes Tested:** Database Connection, Permissions, Memory Leaks, Rate Limiting, Shutdown, Event IDs

---

## 🎯 Test Objectives

Verify that all Phase 1 critical fixes work correctly in a real environment:
1. Database connection waits for verification before proceeding
2. Permission checks prevent unauthorized access
3. Memory leaks are eliminated
4. Rate limiting prevents abuse
5. Graceful shutdown works properly
6. Event IDs use secure hashing

---

## ✅ Pre-Test Setup

### Environment Setup
- [ ] PostgreSQL database running (v12+)
- [ ] Discord bot application created
- [ ] `.env` file configured with all required variables
- [ ] Dependencies installed (`npm install`)
- [ ] Code compiled successfully (`npm run build`)

### Configuration Checklist
```bash
# Required in .env:
DISCORD_TOKEN=your_token_here
DISCORD_CLIENT_ID=your_client_id
ANTHROPIC_API_KEY=your_api_key
DATABASE_URL=postgresql://user:pass@localhost:5432/discord_bot
NODE_ENV=development
LOG_LEVEL=debug
MAX_SUMMARIES_PER_HOUR=5  # Set to 5 for easier testing
```

---

## 🧪 Test Suite

### Test 1: Database Connection Race Condition Fix

**Objective:** Verify bot waits for database connection before starting

**Steps:**
1. Start PostgreSQL: `docker-compose up -d`
2. Clear logs: `rm -rf logs/*.log`
3. Start bot: `npm run dev`
4. Watch startup logs

**Expected Results:**
- ✅ Log shows "Database connection established" with timestamp
- ✅ "Database initialized" appears AFTER connection established
- ✅ "Discord Community Bot started successfully" appears last
- ✅ No queries execute before connection confirmed

**Test with Database Down:**
1. Stop PostgreSQL: `docker-compose down`
2. Start bot: `npm run dev`

**Expected Results:**
- ✅ Bot fails immediately with connection error
- ✅ Log shows "Failed to connect to database"
- ✅ Process exits with code 1
- ✅ No "Bot started" message appears

**Status:** [ ] Pass  [ ] Fail
**Notes:**_____________________________________________________

---

### Test 2: ReadMessageHistory Permission Check

**Objective:** Verify users can't see channels without ReadMessageHistory permission

**Setup:**
1. Create a test Discord server
2. Create a role "NoHistory" with ViewChannel but NOT ReadMessageHistory
3. Create a test channel #restricted
4. Assign "NoHistory" role to a test user
5. Send some messages to #restricted (as admin)

**Steps:**
1. As test user, run `/catchup`
2. Check summary content

**Expected Results:**
- ✅ Test user's summary does NOT include #restricted channel
- ✅ Summary only shows channels where user has ReadMessageHistory
- ✅ No error messages about permissions
- ✅ Log shows correct channel filtering

**Test Reverse:**
1. Grant ReadMessageHistory to "NoHistory" role
2. As test user, run `/catchup` again

**Expected Results:**
- ✅ Summary NOW includes #restricted channel
- ✅ Messages from #restricted appear in summary

**Status:** [ ] Pass  [ ] Fail
**Notes:**_____________________________________________________

---

### Test 3: Memory Leak Fix - Cache Cleanup

**Objective:** Verify cache cleanup intervals can be started and stopped

**Steps:**
1. Start bot with LOG_LEVEL=debug
2. Monitor logs for "Summary cache cleanup started"
3. Wait 30+ minutes (or modify interval in code for faster testing)
4. Check for "Summary cache cleaned" log entries
5. Send SIGINT (Ctrl+C)
6. Check for "Summary cache cleanup stopped"

**Expected Results:**
- ✅ Cache cleanup starts on bot startup
- ✅ Cleanup runs every 30 minutes
- ✅ Cleanup logs show remaining entries
- ✅ Cleanup stops on graceful shutdown
- ✅ No intervals running after bot exits

**Process Check:**
```bash
# After bot exits, verify no node processes left:
ps aux | grep node
# Should show no bot processes
```

**Status:** [ ] Pass  [ ] Fail
**Notes:**_____________________________________________________

---

### Test 4: Rate Limiting

**Objective:** Verify rate limiting prevents abuse

**Setup:**
- Set `MAX_SUMMARIES_PER_HOUR=5` in `.env`
- Restart bot

**Steps:**
1. As test user, run `/catchup` 5 times rapidly
2. Check each response
3. Run `/catchup` a 6th time
4. Note the error message
5. Check time shown in error
6. Wait indicated time
7. Try `/catchup` again

**Expected Results:**
- ✅ First 5 requests succeed
- ✅ 6th request shows rate limit error: "You've reached the rate limit of 5 summaries per hour"
- ✅ Error shows time until reset in minutes
- ✅ After waiting, requests work again
- ✅ Different users have independent limits

**Multi-User Test:**
1. User A uses all 5 requests
2. User B tries `/catchup`

**Expected Results:**
- ✅ User B can still make requests (independent limits)
- ✅ User A still blocked until reset

**Log Check:**
```bash
grep "User rate limited" logs/*.log
# Should show warnings with user IDs
```

**Status:** [ ] Pass  [ ] Fail
**Notes:**_____________________________________________________

---

### Test 5: Background Task Management

**Objective:** Verify all background intervals start and stop correctly

**Steps:**
1. Start bot with LOG_LEVEL=debug
2. Check logs for startup messages
3. Verify tasks run immediately:
   - Database cleanup
   - Event detection
4. Wait for first interval (or check logs)
5. Send SIGINT (Ctrl+C)
6. Check shutdown logs

**Expected Startup Logs:**
```
✅ "Background tasks started"
✅ "Summary cache cleanup started"
✅ "Rate limit cleanup started"
✅ "Running scheduled database cleanup..."
✅ "Running scheduled event detection..."
```

**Expected Shutdown Logs:**
```
✅ "Starting graceful shutdown..."
✅ "Background tasks stopped"
✅ "Summary cache cleanup stopped"
✅ "Rate limit cleanup stopped"
✅ "Database connection pool closed"
✅ "Graceful shutdown complete"
```

**Process Exit Check:**
```bash
# Bot should exit within 5 seconds of SIGINT
time npm run dev
# Then Ctrl+C and verify it exits quickly
```

**Status:** [ ] Pass  [ ] Fail
**Notes:**_____________________________________________________

---

### Test 6: Graceful Shutdown

**Objective:** Verify clean shutdown with no hanging processes

**Steps:**
1. Start bot: `npm run dev`
2. Let it run for 1 minute (generate some activity)
3. Send SIGINT: Press Ctrl+C
4. Watch logs and timing

**Expected Results:**
- ✅ "Starting graceful shutdown..." appears immediately
- ✅ All intervals cleared
- ✅ Database connections closed
- ✅ Process exits within 5 seconds
- ✅ Exit code 0 (success)
- ✅ No error stack traces

**Database Connection Check:**
```sql
-- In psql, check for lingering connections:
SELECT count(*) FROM pg_stat_activity
WHERE datname = 'discord_bot';
-- Should be 0 after bot exits
```

**Test with Active Requests:**
1. Start bot
2. Run `/catchup` (don't wait for completion)
3. Immediately send SIGINT
4. Check shutdown

**Expected Results:**
- ✅ Bot waits for in-flight requests to complete (up to timeout)
- ✅ Still exits cleanly
- ✅ No "unhandled promise" errors

**Status:** [ ] Pass  [ ] Fail
**Notes:**_____________________________________________________

---

### Test 7: Event ID Generation (SHA-256)

**Objective:** Verify event IDs use SHA-256 instead of MD5

**Steps:**
1. Check source code:
```bash
grep -n "createHash" src/services/eventService.ts
# Should show sha256, NOT md5
```

2. Create a Discord scheduled event
3. Check bot logs for event sync
4. Verify event ID format in database:
```sql
SELECT event_id FROM events ORDER BY created_at DESC LIMIT 5;
```

**Expected Results:**
- ✅ Event IDs start with `evt_`
- ✅ Event IDs are 16 characters long (not 12)
- ✅ IDs are hex strings
- ✅ No collisions for similar events

**Code Verification:**
```bash
grep -A 3 "generateEventId" src/services/eventService.ts
# Should show:
# crypto.createHash('sha256')
# hash.substring(0, 16)
```

**Status:** [ ] Pass  [ ] Fail
**Notes:**_____________________________________________________

---

### Test 8: Compilation and Type Safety

**Objective:** Verify all TypeScript compiles without errors

**Steps:**
```bash
# Clean build
rm -rf dist/
npm run build

# Check for errors
echo $?  # Should be 0

# Strict type check
npx tsc --noEmit --strict
```

**Expected Results:**
- ✅ Build completes successfully
- ✅ Exit code 0
- ✅ No TypeScript errors
- ✅ No `any` type warnings in critical code
- ✅ All imports resolve

**Status:** [ ] Pass  [ ] Fail
**Notes:**_____________________________________________________

---

### Test 9: Rate Limiter Unit Tests

**Objective:** Verify rate limiter logic with automated tests

**Steps:**
```bash
npm test -- tests/utils/rateLimiter.test.ts
```

**Expected Results:**
- ✅ All 15 tests pass
- ✅ No test failures
- ✅ Tests complete in < 5 seconds

**Status:** [ ] Pass  [ ] Fail
**Notes:**_____________________________________________________

---

## 🔍 Integration Test Scenarios

### Scenario 1: Full User Journey

**Flow:**
1. User joins Discord server
2. User has limited permissions (can't see #admin-only)
3. User runs `/catchup` for first time (request 1/5)
4. User expands to "detailed" view
5. User expands to "full" view
6. User runs `/catchup` 4 more times rapidly
7. User tries 6th request (should be rate limited)
8. Admin sends SIGINT to restart bot
9. Bot shuts down cleanly
10. Bot restarts
11. User can make requests again (rate limit reset on restart)

**Expected Results:** All steps work as designed with no errors

**Status:** [ ] Pass  [ ] Fail

---

### Scenario 2: High Load Test

**Setup:**
- 10 users
- Each runs `/catchup` 5 times

**Expected Results:**
- ✅ All requests processed
- ✅ Rate limits enforced per user
- ✅ No memory leaks
- ✅ No database connection issues
- ✅ Graceful shutdown still works

**Status:** [ ] Pass  [ ] Fail

---

### Scenario 3: Database Failure Recovery

**Flow:**
1. Start bot (database running)
2. Run `/catchup` successfully
3. Stop PostgreSQL: `docker-compose stop`
4. Try `/catchup` (should fail gracefully)
5. Check logs for database errors
6. Start PostgreSQL: `docker-compose start`
7. Wait for reconnection
8. Try `/catchup` again

**Expected Results:**
- ✅ Bot reports database errors to user
- ✅ No crashes
- ✅ Reconnects when database available
- ✅ Can recover without restart

**Note:** Current implementation may require restart after DB failure

**Status:** [ ] Pass  [ ] Fail  [ ] N/A

---

## 📊 Test Results Summary

| Test | Status | Issues Found | Fixed |
|------|--------|--------------|-------|
| Test 1: Database Connection | [ ] | | |
| Test 2: Permission Check | [ ] | | |
| Test 3: Memory Leak Fix | [ ] | | |
| Test 4: Rate Limiting | [ ] | | |
| Test 5: Background Tasks | [ ] | | |
| Test 6: Graceful Shutdown | [ ] | | |
| Test 7: Event ID SHA-256 | [ ] | | |
| Test 8: Compilation | [ ] | | |
| Test 9: Unit Tests | [ ] | | |
| Scenario 1: User Journey | [ ] | | |
| Scenario 2: High Load | [ ] | | |
| Scenario 3: DB Recovery | [ ] | | |

**Overall Status:** [ ] All Pass [ ] Some Fail [ ] Blocked

---

## 🐛 Issues Found

### Issue Template
```
**Issue #:**
**Test:**
**Severity:** Critical / Major / Minor
**Description:**

**Steps to Reproduce:**
1.
2.
3.

**Expected:**

**Actual:**

**Logs:**

**Fix Required:** Yes / No
```

---

## ✅ Sign-Off

**Tested By:** _________________
**Date:** _________________
**Environment:** Staging / Production
**Approved for Deployment:** [ ] Yes  [ ] No  [ ] With Conditions

**Conditions (if any):**
_______________________________________________________________
_______________________________________________________________

**Notes:**
_______________________________________________________________
_______________________________________________________________
_______________________________________________________________
