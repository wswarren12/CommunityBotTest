# Questing Feature Gap Analysis

**Date:** 2026-01-16
**Reviewer:** Claude (Software Engineer AI)
**Documents Reviewed:**
- `Questing.md` (PRD)
- `QuestingImplementation.md` (Implementation Plan)

---

## Executive Summary

The questing feature implementation is **substantially complete** for Phase 1 POC requirements. All three core commands (`/quest`, `/confirm`, `/xp`) are implemented with proper rate limiting, ephemeral responses, and error handling. The MCP integration for quest verification is in place with a dual-path approach (MCP-based and legacy direct API).

**Implementation Status: ~85% Complete for Phase 1**

### Key Gaps Identified:
1. MCP transport mismatch (stdio vs SSE)
2. Missing environment variable documentation
3. Identifier hashing not implemented (security)
4. Quest creation admin rate limit missing
5. Expired conversation cleanup job missing

---

## Detailed Gap Analysis

### 1. Database Schema

| PRD/Plan Requirement | Status | Notes |
|---------------------|--------|-------|
| `quests` table | ✅ Implemented | All required columns present |
| `user_quests` table | ✅ Implemented | Includes verification tracking |
| `user_xp` table | ✅ Implemented | XP aggregation per user/guild |
| `quest_conversations` table | ✅ Implemented | Conversation state persistence |
| MCP connector fields | ✅ Implemented | Migration 003 adds connector_id, connector_name, api_key_env_var |
| `verification_type` enum | ✅ Extended | Added `twitter_handle` (enhancement) |
| `quest_status` enum (DRAFT/LIVE/PAUSED/ARCHIVED) | ❌ Not implemented | Uses boolean `active` instead |
| `quest_dependencies` table | ⏸️ Deferred | Phase 2 feature |
| `quest_tags` table | ⏸️ Deferred | Phase 2 feature |
| Column naming (title vs name) | ⚠️ Deviation | Uses `name` instead of Summon-aligned `title` |
| Column naming (points vs xp_reward) | ⚠️ Deviation | Uses `xp_reward` instead of Summon-aligned `points` |

**Schema Assessment:** Core schema is complete. Naming deviations from Summon schema are acceptable for Phase 1 but should be considered for future alignment.

---

### 2. Slash Commands

| Requirement | Status | Location | Notes |
|-------------|--------|----------|-------|
| `/quest` command | ✅ Implemented | `src/commands/quest.ts` | Random assignment, edge cases handled |
| `/confirm` command | ✅ Implemented | `src/commands/confirm.ts` | Identifier parameter, verification |
| `/xp` command | ✅ Implemented | `src/commands/xp.ts` | Progress display |
| Ephemeral responses | ✅ Implemented | All commands | Privacy protected |
| DM disabled | ✅ Implemented | All commands | `setDMPermission(false)` |
| Rate limiting | ✅ Implemented | All commands | 5/hour per user |

**Commands Assessment:** Fully implemented per PRD.

---

### 3. Quest Service (`questService.ts`)

| Requirement | Status | Notes |
|-------------|--------|-------|
| `assignQuest()` - random selection | ✅ Implemented | Filters completed, respects max_completions |
| `verifyQuestCompletion()` | ✅ Implemented | Dual-path: MCP and legacy |
| `getUserProgress()` | ✅ Implemented | Returns XP and quest history |
| XP award transaction | ✅ Implemented | Via `addUserXp()` |
| Verification attempt tracking | ✅ Implemented | Max 10 attempts per quest |
| Quest fails after max attempts | ✅ Implemented | Marks quest as failed |
| Edge case: no active quest | ✅ Implemented | Returns helpful message |
| Edge case: no available quests | ✅ Implemented | Returns NO_QUESTS_AVAILABLE message |
| Edge case: all completed | ✅ Implemented | Returns ALL_QUESTS_COMPLETED message |
| Edge case: existing active quest | ✅ Implemented | Returns current quest info |

**Quest Service Assessment:** Fully implemented per PRD.

---

### 4. Quest Creation Service (`questCreationService.ts`)

| Requirement | Status | Notes |
|-------------|--------|-------|
| Conversational quest creation | ✅ Implemented | Via DM or @mention |
| Admin/mod permission check | ✅ Implemented | `hasAdminPermissions()` |
| Trigger keywords | ✅ Implemented | "create a quest", "new quest", etc. |
| Cancel keywords | ✅ Implemented | "cancel", "stop", "quit", etc. |
| Multi-turn conversation | ✅ Implemented | State persisted in DB |
| Claude AI integration | ✅ Implemented | Uses QUEST_BUILDER_SYSTEM_PROMPT |
| MCP connector creation | ✅ Implemented | Creates connector before saving quest |
| Extract quest data from response | ✅ Implemented | Parses JSON and text patterns |
| Conversation expiration (30 min) | ⚠️ Partial | Set to 1 hour in schema |
| Admin rate limit (10/day) | ❌ Not implemented | PRD specifies this limit |

**Quest Creation Assessment:** Core flow complete. Missing admin-specific rate limiting.

---

### 5. MCP Client (`mcpClient.ts`)

| Requirement | Status | Notes |
|-------------|--------|-------|
| MCP client service | ✅ Implemented | Singleton pattern |
| `createOrUpdateConnector()` | ✅ Implemented | Creates MCP connectors |
| `testConnector()` | ✅ Implemented | Validates connectors |
| `validateQuestCompletion()` | ✅ Implemented | High-level verification API |
| Placeholder injection | ✅ Implemented | walletAddress, emailAddress, etc. |
| API key via env var | ✅ Implemented | Never stored in quest data |
| Connection to SSE endpoint | ❌ **Gap** | Uses StdioClientTransport, not HTTP/SSE |
| 10-second timeout | ⚠️ Partial | Not explicitly configured in transport |
| Error handling | ✅ Implemented | Returns error in result object |
| Retry logic | ❌ Not implemented | PRD recommends exponential backoff |

**MCP Client Assessment:** Functional but uses stdio transport instead of HTTP/SSE as specified in PRD. This may need adjustment based on actual MCP deployment.

**Critical Gap:** PRD specifies:
```
MCP URL: https://summon-ai-mcp-development.game7-workers.workers.dev/sse
```
But implementation uses:
```typescript
const transport = new StdioClientTransport({
  command: mcpCommand,
  args: mcpArgs,
  env: envVars,
});
```

---

### 6. Rate Limiting

| Requirement | Status | Notes |
|-------------|--------|-------|
| `/quest` - 5/hour | ✅ Implemented | In questService |
| `/confirm` - 5/hour | ✅ Implemented | In questService |
| `/xp` - 5/hour | ✅ Implemented | In questService |
| Quest creation - 10/day per admin | ❌ Not implemented | Should be added |
| In-memory tracking | ✅ Implemented | Map with TTL cleanup |
| Rate limit cleanup | ✅ Implemented | `cleanupRateLimitCache()` runs every 5 min |

**Rate Limiting Assessment:** User command rate limits complete. Admin quest creation rate limit missing.

---

### 7. Security Requirements

| Requirement | Status | Notes |
|-------------|--------|-------|
| Admin permission validation | ✅ Implemented | Multiple permission checks |
| Input sanitization | ⚠️ Partial | Identifier maxLength(200) enforced |
| API credentials in env vars | ✅ Implemented | `api_key_env_var` stores name, not value |
| Ephemeral responses | ✅ Implemented | All commands use ephemeral |
| API timeout | ⚠️ Partial | 10s timeout in legacy verification only |
| Audit logging | ✅ Implemented | Winston logs all operations |
| Hash identifiers post-verification | ❌ Not implemented | PRD recommends this |
| Purge failed verification data (7 days) | ❌ Not implemented | PRD recommends this |
| XSS prevention in descriptions | ✅ Implemented | Discord handles markdown |

**Security Assessment:** Core security implemented. Sensitive data handling could be improved.

---

### 8. Prompts & AI Integration

| Requirement | Status | Notes |
|-------------|--------|-------|
| QUEST_BUILDER_SYSTEM_PROMPT | ✅ Implemented | Comprehensive prompt with MCP DSL |
| DOCUMENTATION_READER_SKILL | ✅ Implemented | Embedded in quest builder prompt |
| ValidationFn DSL | ✅ Implemented | count, sum, compare, exists operations |
| Quest templates | ✅ Implemented | Assignment, completion, failure templates |
| XP progress template | ✅ Implemented | Shows completed quests and current |

**Prompts Assessment:** Fully implemented.

---

### 9. Message Handling

| Requirement | Status | Notes |
|-------------|--------|-------|
| DM handling for quest creation | ✅ Implemented | `handleDMMessage()` |
| @mention handling | ✅ Implemented | `handleBotMention()` |
| Typing indicator | ✅ Implemented | `sendTyping()` called |
| Long message splitting | ✅ Implemented | `splitMessage()` at 2000 chars |
| Guild detection for DMs | ✅ Implemented | Finds guild where user is admin |

**Message Handling Assessment:** Fully implemented.

---

### 10. Environment Configuration

| Variable | Status | Notes |
|----------|--------|-------|
| DISCORD_TOKEN | ✅ Documented | In .env.example |
| ANTHROPIC_API_KEY | ✅ Documented | In .env.example |
| DATABASE_URL | ✅ Documented | In .env.example |
| MCP_TOKEN | ❌ Missing | Not in .env.example |
| MCP_QUEST_BUILDER_COMMAND | ❌ Missing | Used in mcpClient but not documented |
| MCP_QUEST_BUILDER_ARGS | ❌ Missing | Used in mcpClient but not documented |

**Environment Assessment:** MCP-related variables need to be documented.

---

## Gaps Summary

### Critical (Must Fix)

1. **MCP Transport Mismatch**
   - PRD specifies HTTP/SSE endpoint
   - Implementation uses stdio transport
   - **Impact:** May not connect to actual Summon MCP
   - **Fix:** Implement HTTP/SSE transport or confirm stdio is acceptable

2. **Environment Variables Missing**
   - MCP_TOKEN, MCP_QUEST_BUILDER_COMMAND, MCP_QUEST_BUILDER_ARGS not documented
   - **Impact:** Deployment will fail
   - **Fix:** Update .env.example

### High (Should Fix)

3. **Admin Quest Creation Rate Limit**
   - PRD specifies 10 quests/day per admin
   - **Impact:** Admins could spam quest creation
   - **Fix:** Add rate limit in questCreationService

4. **Identifier Hashing**
   - PRD recommends hashing identifiers post-verification
   - **Impact:** Plain text sensitive data in database
   - **Fix:** Hash verification_identifier after successful verification

5. **Expired Conversation Cleanup**
   - Schema has expires_at but no cleanup job
   - **Impact:** Database bloat over time
   - **Fix:** Add cleanup job (can use existing cleanupExpiredConversations query)

### Medium (Nice to Have)

6. **MCP Retry Logic**
   - PRD recommends exponential backoff
   - **Impact:** Transient failures may cause unnecessary failures
   - **Fix:** Add retry wrapper

7. **Conversation Timeout**
   - PRD says 30 minutes, implementation is 1 hour
   - **Impact:** Minor - conversations stay active longer
   - **Fix:** Change INTERVAL in queries.ts

8. **Quest Status Enum**
   - PRD suggests DRAFT/LIVE/PAUSED/ARCHIVED
   - **Impact:** Less granular quest lifecycle management
   - **Fix:** Phase 2 consideration

---

## Recommendations

### Immediate Actions

1. **Add MCP environment variables to .env.example:**
```
# MCP Quest Builder Configuration
MCP_TOKEN=your_mcp_token_here
MCP_QUEST_BUILDER_COMMAND=npx
MCP_QUEST_BUILDER_ARGS=-y @anthropic/quest-builder-mcp
```

2. **Clarify MCP transport with Summon team:**
   - Confirm whether stdio or HTTP/SSE is correct
   - If HTTP/SSE needed, refactor mcpClient to use EventSource

3. **Add admin quest creation rate limit:**
```typescript
const ADMIN_RATE_LIMITS = {
  questCreation: { maxAttempts: 10, windowMs: 24 * 60 * 60 * 1000 }, // 10 per day
};
```

### Short-term Improvements

4. Add conversation cleanup job to background tasks
5. Hash verification identifiers after successful verification
6. Add MCP retry logic with exponential backoff

### Phase 2 Considerations

7. Implement quest_status enum for better lifecycle management
8. Add quest_dependencies table for quest chains
9. Add quest_tags table for categorization
10. Align column names with Summon schema (title/points)

---

## Test Coverage Recommendations

The following test scenarios should be verified:

1. **Quest Assignment**
   - [ ] User gets random quest when none active
   - [ ] User sees current quest when one is active
   - [ ] User sees "all completed" when done
   - [ ] User sees "no quests" when none available
   - [ ] Rate limit enforced after 5 requests

2. **Quest Verification**
   - [ ] MCP-based verification succeeds
   - [ ] Legacy API verification succeeds
   - [ ] XP awarded correctly on success
   - [ ] Failure message shown on invalid identifier
   - [ ] Quest fails after 10 attempts
   - [ ] Rate limit enforced

3. **XP Tracking**
   - [ ] Shows correct total XP
   - [ ] Lists completed quests in order
   - [ ] Shows current active quest
   - [ ] Handles user with no history

4. **Quest Creation**
   - [ ] Only admins can create quests
   - [ ] Trigger keywords start conversation
   - [ ] Cancel keywords end conversation
   - [ ] MCP connector created successfully
   - [ ] Quest saved to database

---

## Conclusion

The questing feature implementation is solid and covers the core Phase 1 POC requirements. The main areas needing attention are:

1. MCP transport configuration (critical)
2. Environment variable documentation (critical)
3. Admin rate limiting (high)
4. Security improvements for identifier storage (high)

Once these gaps are addressed, the feature should be ready for production testing.
