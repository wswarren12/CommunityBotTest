# Questing Feature PRD

**Product Requirements Document**
**Version:** 1.0
**Author:** Product Manager
**Date:** 2026-01-14
**Status:** Draft

---

## Executive Summary

This document outlines the requirements for implementing a questing system into the Discord Community Bot. The questing feature will enable server administrators and moderators to create engagement-driven quests that community members can complete to earn XP. Quest completion is verified through an external API integration via an existing Quest Builder MCP (Model Context Protocol).

---

## Problem Statement

Discord communities struggle to maintain consistent member engagement and reward active participation. Currently, there's no structured way to:
- Incentivize specific behaviors or actions
- Track and reward community member achievements
- Gamify the community experience
- Verify that members have completed off-platform actions

---

## Goals & Success Metrics

### Goals
1. Increase community engagement through gamified quests
2. Provide admins with an easy, conversational interface to create quests
3. Enable verifiable quest completion via external API integration
4. Build a transparent XP/reward system that motivates participation

### Success Metrics
| Metric | Target |
|--------|--------|
| Quest completion rate | >40% of assigned quests |
| User engagement with /quest | >20% of active members |
| Admin quest creation adoption | >50% of servers with 3+ quests |
| User XP check frequency | Weekly per active user |

---

## User Personas

### Admin/Moderator (Quest Creator)
- Has admin or moderator role in the Discord server
- Wants to create engaging activities for community members
- Needs a simple way to define quests without technical knowledge
- Requires flexibility in quest types and reward amounts

### Community Member (Quest Participant)
- Active Discord user looking for ways to engage
- Motivated by rewards, recognition, and progress
- Expects clear instructions and fair reward distribution
- Wants visibility into their achievements

---

## Feature Requirements

### 1. Quest Creation (Admin/Moderator)

**Conversational Quest Builder**

Admins and moderators can interact with the bot via DM or a designated channel to create quests using natural language.

**Flow:**
1. Admin initiates conversation with bot (DM or mention)
2. Bot recognizes admin/mod role and enables quest builder mode
3. Admin describes the quest in natural language
4. The Bot uses the Documentation Reader Skill to read the API documentation identified by the admin and create a curl request that it can pass to the Quest Builder MCP
5. The Quest Builder MCP structures the quest and creates the API calls needed to confirm a user has completed a quest along with what information (ex. email or twitter handle) is needed for the API call to successfully return an event. 
6. Bot confirms quest details and saves to database

**Required Quest Properties:**
| Property | Type | Description | Required |
|----------|------|-------------|----------|
| `name` | string | Quest display name (max 100 chars) | Yes |
| `description` | string | Detailed quest instructions (max 1000 chars) | Yes |
| `xp_reward` | integer | XP awarded on completion (1-10000) | Yes |
| `verification_type` | enum | `email`, `discord_id`, `wallet_address` | Yes |
| `api_endpoint` | string | External API endpoint for verification | Yes |
| `api_params` | json | Params needed for API call | No |
| `active` | boolean | Whether quest is available for assignment | Yes |
| `max_completions` | integer | Max times quest can be completed (null = unlimited) | No |

**Example Conversation:**
```
Admin: I want to create a quest for users to mint their first NFT on our platform
Bot: Great! I'll help you create that quest. What would you like to call it?
Admin: "First Mint Achievement"
Bot: Perfect! How much XP should users earn for completing this quest?
Admin: 500 XP
Bot: What information do we need from users to verify completion?
Admin: Their wallet address
Bot: Where can I find the documentation for the API to call to confirm the mint? 
Admin: You can call the OpenSea API, here's a link to their documentation: https://docs.opensea.io/reference/api-overview
Bot: Got it! I've created the quest:
     - Name: First Mint Achievement
     - Description: Mint your first NFT on our platform
     - Reward: 500 XP
     - Verification: Wallet address
     Should I activate this quest now?
Admin: Yes
Bot: Give me a moment to create this quest and I'll come back with any questions. 
Admin: Thanks!
Bot: I've successfully created this quest. Users can now receive this quest.
```

**Permissions:**
- Only users with `ADMINISTRATOR` or `MANAGE_GUILD` permissions, or roles named "Admin" or "Moderator" can create quests
- Quest creation is server-specific

---

### 2. Quest Assignment (/quest Command)

**Command:** `/quest`

**Behavior:**
1. User runs `/quest` in any channel
2. Bot checks if user has any incomplete assigned quests
3. If no incomplete quests, bot randomly assigns an available quest
4. Bot responds with ephemeral message containing quest details
5. Quest assignment is logged in database

**Response Format:**
```
🎯 Quest Assigned: First Mint Achievement

📋 Description:
Mint your first NFT on our platform

🏆 Reward: 500 XP

📝 How to Complete:
1. Complete the quest action described above
2. Run /confirm with your wallet address
3. We'll verify your completion and award your XP!

Good luck, adventurer!
```

**Edge Cases:**
- User has incomplete quest: Show current quest instead of assigning new one
- No available quests: Inform user no quests are currently available
- All quests completed: Congratulate user and inform them to check back later

**Random Assignment Logic:**
- Weight by quest priority (if implemented)
- Exclude quests user has already completed (unless repeatable)
- Exclude quests that have reached max_completions

---

### 3. Quest Verification (/confirm Command)

**Command:** `/confirm`

**Options:**
| Option | Type | Description | Required |
|--------|------|-------------|----------|
| `identifier` | string | Email, Discord ID, or wallet address | Yes |

**Flow:**
1. User runs `/confirm identifier:<value>`
2. Bot retrieves user's current assigned quest
3. Bot calls external verification API via Quest Builder MCP
4. API returns success/failure
5. On success: Award XP, mark quest complete, notify user
6. On failure: Inform user quest not verified, provide guidance
7. On failure: Remind the user what identifier information they need to provide

**API Integration:**
```
Request to External API:
POST {quest.api_endpoint}
{
  "user_identifier": "<provided identifier>"
}

Expected Response:
{
  "verified": true|false [or value >0],
  "message": "Optional message",
  "metadata": {} // Optional additional data
}
```

**Success Response:**
```
✅ Quest Complete: First Mint Achievement

🎉 Congratulations! Your completion has been verified.

💰 XP Earned: +500 XP
📊 Total XP: 1,250 XP

Run /quest to get your next adventure!
```

**Failure Response:**
```
❌ Verification Failed

We couldn't verify your quest completion for "First Mint Achievement".

Possible reasons:
• The action hasn't been completed yet
• The identifier provided doesn't match our records
• There may be a delay in our verification system

Please ensure you've completed the quest and try again later.
Need help? Contact a moderator.
```

**Security Considerations:**
- Rate limit /confirm to prevent API abuse (3 attempts per hour per user)
- Log all verification attempts for audit
- Sanitize identifier input before API call
- Timeout API calls after 10 seconds

---

### 4. XP & Progress Tracking (/xp Command)

**Command:** `/xp`

**Behavior:**
1. User runs `/xp`
2. Bot retrieves user's XP total and quest history
3. Bot responds with ephemeral message showing progress

**Response Format:**
```
📊 Your Quest Progress

⭐ Total XP: 1,250

🏆 Completed Quests (3):
├─ First Mint Achievement (+500 XP) - Jan 10
├─ Join Discord Event (+200 XP) - Jan 8
└─ Connect Wallet (+550 XP) - Jan 5

🎯 Current Quest:
└─ Refer a Friend (750 XP) - Assigned Jan 12

Keep questing to climb the leaderboard!
```

**Optional Enhancements (Future):**
- Server leaderboard
- XP milestones/badges
- Weekly/monthly stats

---

## Data Model

### New Tables

**quests**
```sql
CREATE TABLE quests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id VARCHAR(32) NOT NULL,
  name VARCHAR(100) NOT NULL,
  description TEXT NOT NULL,
  xp_reward INTEGER NOT NULL CHECK (xp_reward > 0 AND xp_reward <= 10000),
  verification_type VARCHAR(20) NOT NULL CHECK (verification_type IN ('email', 'discord_id', 'wallet_address')),
  api_endpoint TEXT NOT NULL,
  api_params JSONB DEFAULT '{}',
  active BOOLEAN DEFAULT true,
  max_completions INTEGER,
  created_by VARCHAR(32) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_quests_guild_active ON quests(guild_id, active);
```

**user_quests**
```sql
CREATE TABLE user_quests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR(32) NOT NULL,
  guild_id VARCHAR(32) NOT NULL,
  quest_id UUID NOT NULL REFERENCES quests(id),
  status VARCHAR(20) NOT NULL DEFAULT 'assigned' CHECK (status IN ('assigned', 'completed', 'failed', 'expired')),
  assigned_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP,
  verification_identifier TEXT,
  xp_awarded INTEGER DEFAULT 0,
  UNIQUE(user_id, guild_id, quest_id, assigned_at)
);

CREATE INDEX idx_user_quests_user_status ON user_quests(user_id, guild_id, status);
CREATE INDEX idx_user_quests_quest ON user_quests(quest_id);
```

**user_xp**
```sql
CREATE TABLE user_xp (
  user_id VARCHAR(32) NOT NULL,
  guild_id VARCHAR(32) NOT NULL,
  total_xp INTEGER DEFAULT 0,
  quests_completed INTEGER DEFAULT 0,
  last_quest_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (user_id, guild_id)
);

CREATE INDEX idx_user_xp_leaderboard ON user_xp(guild_id, total_xp DESC);
```

### Modifications to Existing Tables

**users** - Add XP fields (or use separate user_xp table as above)

---

## Technical Architecture

### MCP Integration

The Quest Builder MCP provides:

1. **Quest Structuring** - Converts natural language to structured API call 
2. **API Routing** - Handles external API calls for verification
3. **Response Parsing** - Converts API responses from balances, true / false, or timestamps into "verified" or "not verified" 

**MCP Tools Used:**
Use the methods in the Summon MCP accesible at: https://summon-ai-mcp-development.game7-workers.workers.dev/sse

***MCP Documentation**
{
	"servers": {
		"MPC-SUMMON": {
			"url": "https://summon-ai-mcp-development.game7-workers.workers.dev/sse",
			"type": "http",
			"headers": {
				"Authorization": "MCP_TOKEN"
			},
      "dev": "debug"
		}
	},
	"inputs": []
}

### Command Registration

```typescript
// New slash commands to register
const questCommands = [
  {
    name: 'quest',
    description: 'Get a quest assigned to you'
  },
  {
    name: 'confirm',
    description: 'Confirm quest completion',
    options: [{
      name: 'identifier',
      description: 'Your email, wallet address, or other verification info',
      type: 'STRING',
      required: true
    }]
  },
  {
    name: 'xp',
    description: 'View your XP and completed quests'
  }
];
```

---

## User Flows

### Flow 1: Admin Creates Quest
```
┌─────────────────────────────────────────────────────────┐
│ Admin DMs Bot or @mentions in admin channel             │
└────────────────────────┬────────────────────────────────┘
                         ▼
┌─────────────────────────────────────────────────────────┐
│ Bot verifies admin/mod role                             │
└────────────────────────┬────────────────────────────────┘
                         ▼
┌───────────────────────────────────────────────────────────────────┐
│ Conversational quest creation via Skill and Quest Builder MCP     │
└────────────────────────┬──────────────────────────────────────────┘
                         ▼
┌─────────────────────────────────────────────────────────┐
│ Quest saved to database, confirmation sent              │
└─────────────────────────────────────────────────────────┘
```

### Flow 2: User Completes Quest
```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  /quest      │────▶│ Quest        │────▶│ User does    │
│  command     │     │ assigned     │     │ quest action │
└──────────────┘     └──────────────┘     └──────┬───────┘
                                                  │
┌──────────────┐     ┌──────────────┐     ┌──────▼───────┐
│  XP awarded  │◀────│ API verifies │◀────│  /confirm    │
│  to user     │     │ completion   │     │  command     │
└──────────────┘     └──────────────┘     └──────────────┘
```

---

## Security & Privacy

### Data Protection
- User identifiers (emails, wallet addresses) are only used for verification
- Identifiers are not stored in plain text after verification
- API endpoints are validated before storage

### Access Control
- Quest creation restricted to admin/mod roles
- Users can only view their own XP and quests
- API credentials stored securely (not in quest data)

### Rate Limiting
| Action | Limit |
|--------|-------|
| /quest | 5 per hour per user |
| /confirm | 5 per hour per user |
| /xp | 5 per hour per user |
| Quest creation | 10 per day per admin |

---

## Rollout Plan

### Phase 1: POC (This Document)
- Basic quest CRUD via conversation
- Random quest assignment
- Single verification type per quest
- XP tracking and display

### Phase 2: Enhanced Features
- Quest categories/tags
- Difficulty levels
- Server leaderboards
- Quest chains/prerequisites

### Phase 3: Advanced
- Recurring/daily quests
- Team quests
- Custom rewards beyond XP
- Analytics dashboard for admins

---

## Open Questions

1. **Quest Expiration**: Should assigned quests expire after a certain time? **Answer** Not for Phase 1 POC
2. **Multiple Active Quests**: Should users be able to have multiple quests at once? **Answer** Not for Phase 1 POC
3. **Quest Editing**: Can admins edit active quests? What happens to in-progress assignments? **Answer** Not for Phase 1 POC
4. **XP Decay**: Should XP decay over time to encourage continued engagement? **Answer** Not for Phase 1 POC
5. **Verification Retry**: How many times can a user attempt verification before lockout? **Answer** 10

---

## Appendix

### API Contract Example

**Verification Request:**
```json
POST https://api.example.com/param1/param2/userWallet
Content-Type: application/json

{
  "param1": "0x1234...abcd",
  "param2": "0x1234...abcd",
  "wallet_address": "0x1234...abcd"
}
```

**Verification Response (Success):**
```json
{
  "balance": 1,
  "metadata": {
    "nft_id": "12345",
    "collection": "Genesis"
  }
}
```

**Verification Response (Failure):**
```json
{
  "balance": 0,
  "metadata": {
    "nft_id": "12345",
    "collection": "Genesis"
  }
}
```

---

**Document History:**
| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-01-14 | Product Manager | Initial draft |

**Implementation Documentation**

# Questing Feature Implementation Plan

**Document Type:** Technical Implementation Plan
**Version:** 1.0
**Author:** Claude (Senior Software Architect AI)
**Date:** 2026-01-16
**Status:** Ready for Review - BLOCKERS IDENTIFIED

---

## PRD Summary

The Questing feature adds a gamification layer to the Discord Community Bot, enabling server admins to create engagement-driven quests that community members can complete to earn XP. Quest completion is verified through external API integration via the Summon Quest Builder MCP. The system provides three primary commands: `/quest` for quest assignment, `/confirm` for verification, and `/xp` for progress tracking. Admins create quests through conversational interaction with the bot, which uses the Documentation Reader Skill and Summon MCP to structure API verification calls.

**Business Value:** Increases community engagement through structured gamification while providing admins with a simple, conversational interface for quest creation.

---

## Requirements Analysis

### Functional Requirements

#### P0 (Critical - Phase 1 POC)
1. **Quest Creation via Conversation**
   - Admin/moderator permission validation
   - Natural language quest description processing
   - Integration with Documentation Reader Skill to parse API documentation
   - Integration with Summon MCP for quest structuring and API call generation
   - Quest property extraction (name, description, XP reward, verification type, API endpoint)
   - Quest activation and database storage

2. **Quest Assignment (/quest command)**
   - Random quest assignment from active, available quests
   - Exclude completed quests (unless repeatable)
   - Exclude quests at max_completions limit
   - Ephemeral response with quest details and instructions
   - Handle edge cases (no available quests, all completed, existing incomplete quest)

3. **Quest Verification (/confirm command)**
   - User identifier collection (email, discord_id, wallet_address)
   - API call to external verification endpoint via Summon MCP
   - XP award on successful verification
   - Quest status update (completed/failed)
   - User notification with success/failure response

4. **XP & Progress Tracking (/xp command)**
   - Display total XP
   - List completed quests with dates and XP earned
   - Show current assigned quest
   - Ephemeral response for privacy

5. **Database Schema**
   - `quests` table with all required properties
   - `user_quests` table for assignment and completion tracking
   - `user_xp` table for XP aggregation per user/guild
   - Proper indexes for performance
   - Foreign key relationships

#### P1 (Important - Phase 2)
- Quest categories/tags for organization
- Difficulty levels for progressive engagement
- Server leaderboards for competitive motivation
- Quest chains/prerequisites for narrative structure
- Quest editing capabilities for admins
- Quest deactivation without deletion

#### P2 (Nice to Have - Phase 3)
- Recurring/daily quests
- Team quests for collaborative engagement
- Custom rewards beyond XP (roles, badges)
- Analytics dashboard for admin insights
- Quest templates for common patterns

### Non-Functional Requirements

#### Performance
- API verification calls must timeout after 10 seconds (as specified in PRD)
- Quest assignment should complete within 2 seconds
- XP lookups should be near-instantaneous (<500ms)
- Database queries optimized with proper indexes
- Rate limiting to prevent API abuse

#### Security
- Admin/moderator permission validation before quest creation
- User identifier sanitization before external API calls
- API credentials stored securely (environment variables, not in quest data)
- Rate limiting: 5 attempts per hour per command per user (PRD specifies 3 for /confirm, harmonizing to 5)
- Audit logging for all verification attempts
- No plain-text storage of sensitive user identifiers post-verification

#### Scalability
- Support multiple guilds with isolated quest pools
- Handle concurrent verification requests
- Database connection pooling for high-load scenarios
- Cache frequently accessed quest data
- Support guilds with 1000+ active quest participants

#### Privacy
- User XP and quest history only visible to the user (ephemeral responses)
- User identifiers used only for verification, not stored long-term
- Respect Discord's data retention policies

#### Observability
- Winston logger integration for all quest operations
- Detailed logging for quest creation, assignment, verification
- Error tracking with context for debugging
- Metrics: quest completion rate, verification success rate, XP distribution

---

## OPEN QUESTIONS (MUST RESOLVE BEFORE IMPLEMENTATION)

### CRITICAL (Blockers)

1. **Summon MCP API Documentation**
   - ❌ BLOCKER: No API documentation provided for Summon MCP
   - Need: Complete API reference with tool names, methods, request/response schemas
   - Need: Example requests and responses for verification and quest structuring
   - Need: Authentication details (how to use MCP_TOKEN)
   - Need: Error handling guidance (error codes, timeout behavior)
   - **ACTION:** Request comprehensive MCP API documentation from Game7/Summon team

2. **Documentation Reader Skill**
   - ❌ BLOCKER: "Documentation Reader Skill" mentioned in PRD but not defined
   - Is this an existing skill in the codebase? (checked: not found)
   - Is this a Claude Code built-in skill? (checked: not available)
   - Should we implement using WebFetch tool for documentation parsing?
   - **ACTION:** Clarify if this is a custom skill to build or existing tool to use

3. **Quest Creation Trigger Mechanism**
   - ⚠️ Important: PRD says "Admin initiates conversation with bot (DM or mention)"
   - Should we require explicit trigger phrase ("create quest", "new quest")?
   - Or should bot auto-detect intent from any admin message?
   - Or should we use a `/createquest` slash command instead?
   - **RECOMMENDATION:** Use slash command `/createquest` for clarity and discoverability

4. **Verification Response Schema**
   - ⚠️ Important: PRD shows two different schemas:
     - Section 3: `{ "verified": true|false, "message": "...", "metadata": {} }`
     - Appendix: `{ "balance": 1, "metadata": {...} }`
   - Which is correct? Should bot support both?
   - How does MCP normalize different API responses to a single schema?
   - **RECOMMENDATION:** Support both, treat any truthy value as verified (balance > 0, verified: true, etc.)

### HIGH PRIORITY (Need before Phase 4)

5. **MCP Quest Structuring Capability**
   - Does Summon MCP actually provide a "structure quest" tool?
   - Or do we need to build this logic in the bot using Claude?
   - What level of intelligence does MCP provide for API parsing?
   - **ACTION:** Confirm MCP capabilities or plan to build in-bot

6. **API Documentation Format Support**
   - What documentation formats should we support? (OpenAPI, Swagger, plain text, custom?)
   - Should admin be able to paste JSON schema instead of URL?
   - **RECOMMENDATION:** Support URLs (via WebFetch) and manual API endpoint entry as fallback

7. **Quest Creation Session Storage**
   - In-memory (current plan) vs database persistence?
   - Trade-off: In-memory is simpler but lost on bot restart
   - **RECOMMENDATION:** Start with in-memory, migrate to database in Phase 2 if needed

### MEDIUM PRIORITY (Can decide during implementation)

8. **Verification Retry Limit Scope**
   - Is 10 retries per quest assignment, per hour, or per user lifetime?
   - **RECOMMENDATION:** 10 per quest assignment (reset on new assignment)

9. **Failed Verification Data Retention**
   - Should we store failed verification identifiers for debugging?
   - Privacy implications if storing emails/wallets
   - **RECOMMENDATION:** Store hashed identifiers, purge after 7 days

10. **Quest Completion Notifications**
    - Should quest completion be announced publicly or stay ephemeral?
    - Should there be a #quest-completions channel?
    - **RECOMMENDATION:** Keep ephemeral for Phase 1, add public option in Phase 2

11. **XP Leaderboard Visibility**
    - Should leaderboard be public or opt-in?
    - GDPR implications for EU users
    - **RECOMMENDATION:** Implement `/leaderboard` command in Phase 2 with opt-out option

12. **Quest Priority/Weighting**
    - Schema supports priority field, but PRD doesn't specify algorithm
    - **RECOMMENDATION:** Use simple random for Phase 1, add weighted random in Phase 2

---

## Proposed Architecture

### Overview

The Questing system extends the existing Discord Community Bot with four new major components:

```
┌─────────────────────────────────────────────────────────────────┐
│                        Discord Client                            │
│                    (src/bot/client.ts)                           │
└───────────────────┬─────────────────────────────────────────────┘
                    │
    ┌───────────────┼───────────────┐
    │               │               │
    ▼               ▼               ▼
┌─────────┐   ┌─────────┐   ┌─────────────┐
│ /quest  │   │/confirm │   │    /xp      │
│ command │   │ command │   │   command   │
└────┬────┘   └────┬────┘   └──────┬──────┘
     │             │                │
     │    ┌────────┴────────┐       │
     │    │                 │       │
     ▼    ▼                 ▼       ▼
┌────────────────────────────────────────┐
│         Quest Service Layer             │
│  - assignQuest()                        │
│  - verifyQuestCompletion()              │
│  - getUserXPProgress()                  │
│  - createQuest() (conversational)       │
└────────────┬───────────────────────────┘
             │
    ┌────────┼────────┐
    │        │        │
    ▼        ▼        ▼
┌─────────┐  ┌──────────────┐  ┌─────────────┐
│   DB    │  │   MCP        │  │  AI Service │
│ Queries │  │  Integration │  │  (Claude)   │
│(quests, │  │  (Summon     │  │             │
│user_xp) │  │  MCP)        │  │             │
└─────────┘  └──────────────┘  └─────────────┘
             - verify()
             - structureQuest()
```

**Key Design Principles:**
1. **Service-based Architecture**: Quest logic isolated in QuestService, following existing SummaryService pattern
2. **Stateless Commands**: All commands are stateless, data stored in PostgreSQL
3. **MCP Abstraction**: Summon MCP interaction encapsulated in MCPClient service
4. **Conversational Quest Creation**: Leverages Claude for natural language understanding
5. **Rate Limiting**: Reuse existing rate limiter pattern from catchup command

---

### Component Design

#### 1. Quest Service (`src/services/questService.ts`)

**Purpose:** Core business logic for quest management, assignment, and verification

**Responsibilities:**
- Quest assignment algorithm (random selection with filtering)
- Quest verification orchestration (call MCP, update database, award XP)
- XP calculation and user_xp table updates
- Quest eligibility checking (completed, max_completions, active status)

**Key Methods:**
```typescript
interface QuestService {
  // Assign a random available quest to a user
  assignQuest(userId: string, guildId: string): Promise<Quest | null>;

  // Verify quest completion via external API
  verifyQuestCompletion(
    userId: string,
    guildId: string,
    questId: string,
    identifier: string
  ): Promise<VerificationResult>;

  // Get user XP and quest history
  getUserXPProgress(userId: string, guildId: string): Promise<XPProgress>;

  // Check if user has incomplete assigned quest
  getUserActiveQuest(userId: string, guildId: string): Promise<Quest | null>;

  // Get all available quests for a user (not completed, active, under max_completions)
  getAvailableQuests(userId: string, guildId: string): Promise<Quest[]>;

  // Award XP to user (transactional)
  awardXP(userId: string, guildId: string, amount: number, questId: string): Promise<void>;
}
```

**Dependencies:**
- `src/db/queries.ts` (database operations)
- `src/services/mcpClient.ts` (Summon MCP integration)
- `src/utils/logger.ts` (logging)

**Error Handling:**
- Throw descriptive errors for user-facing issues (e.g., "No available quests")
- Log but don't throw for non-critical failures (e.g., analytics update failure)
- Use database transactions for XP awards to ensure atomicity

---

#### 2. Quest Creation Service (`src/services/questCreationService.ts`)

**Purpose:** Handle conversational quest creation with AI assistance

**Responsibilities:**
- Detect quest creation intent from messages
- Manage multi-turn conversation state for quest building
- Call Claude to extract quest parameters from natural language
- Integrate with Documentation Reader (WebFetch or custom skill)
- Call Summon MCP to structure API calls and verification logic
- Validate and save quest to database

**Key Methods:**
```typescript
interface QuestCreationService {
  // Detect if message is quest creation intent
  isQuestCreationIntent(message: string): boolean;

  // Start quest creation conversation
  startQuestCreation(userId: string, guildId: string): Promise<ConversationState>;

  // Process user message in quest creation flow
  processQuestCreationMessage(
    conversationId: string,
    message: string
  ): Promise<ConversationResponse>;

  // Parse API documentation URL and extract endpoint info
  parseAPIDocumentation(url: string): Promise<APIDocumentation>;

  // Call Summon MCP to structure quest verification
  structureQuestWithMCP(questData: QuestData): Promise<StructuredQuest>;

  // Save completed quest to database
  saveQuest(quest: StructuredQuest, creatorId: string): Promise<Quest>;
}
```

**Conversation State Management:**
```typescript
interface ConversationState {
  conversationId: string;
  userId: string;
  guildId: string;
  stage: 'name' | 'xp_reward' | 'verification_type' | 'api_docs' | 'confirmation';
  collectedData: Partial<QuestData>;
  createdAt: Date;
  expiresAt: Date; // 30 minute timeout
}
```

**Dependencies:**
- `src/services/aiService.ts` (Claude for NLP)
- `src/services/mcpClient.ts` (Summon MCP integration)
- `src/tools/WebFetch` (or custom Documentation Reader)
- In-memory conversation state cache (Map with TTL)

**Security Considerations:**
- Validate admin/moderator role before starting conversation
- Sanitize API URLs before fetching documentation
- Validate quest properties (XP range, string length limits)
- Rate limit quest creation: 10 per day per admin

---

#### 3. MCP Client Service (`src/services/mcpClient.ts`)

**Purpose:** Abstraction layer for Summon MCP integration via SSE

**Responsibilities:**
- HTTP SSE connection to Summon MCP endpoint
- Call MCP tools for quest verification and structuring
- Handle MCP authentication (Authorization header)
- Parse MCP responses and handle errors
- Timeout handling (10 second limit)

**Key Methods:**
```typescript
interface MCPClient {
  // Call Summon MCP to verify quest completion
  verifyQuest(
    apiEndpoint: string,
    apiParams: Record<string, any>,
    userIdentifier: string
  ): Promise<MCPVerificationResponse>;

  // Call Summon MCP to structure quest from API documentation
  structureQuest(
    apiDocumentation: string,
    questDescription: string
  ): Promise<MCPQuestStructure>;

  // Test MCP connection
  testConnection(): Promise<boolean>;
}

interface MCPVerificationResponse {
  verified: boolean;
  message?: string;
  metadata?: Record<string, any>;
}

interface MCPQuestStructure {
  apiEndpoint: string;
  apiParams: Record<string, any>;
  verificationType: 'email' | 'discord_id' | 'wallet_address';
  verificationField: string; // Which field in the API call to use
}
```

**Technical Implementation:**
- Use `fetch()` with SSE headers for connection
- Implement EventSource-like parsing for SSE messages
- Add request timeout using `AbortController`
- Retry logic with exponential backoff for transient failures
- Cache MCP authentication token

**Configuration:**
```typescript
const MCP_CONFIG = {
  url: 'https://summon-ai-mcp-development.game7-workers.workers.dev/sse',
  timeout: 10000, // 10 seconds
  headers: {
    'Authorization': `Bearer ${process.env.MCP_TOKEN}`,
    'Content-Type': 'application/json',
  },
};
```

**Error Handling:**
- Timeout errors: Return `{ verified: false, message: 'Verification timeout' }`
- Network errors: Log and return `{ verified: false, message: 'Verification service unavailable' }`
- Invalid response: Log raw response and return false

---

#### 4. Database Queries (`src/db/questQueries.ts`)

**Purpose:** PostgreSQL queries for quest data operations

**Key Functions:**
```typescript
// Quest CRUD
async function createQuest(quest: NewQuest): Promise<Quest>;
async function getQuestById(questId: string): Promise<Quest | null>;
async function getActiveQuests(guildId: string): Promise<Quest[]>;
async function updateQuest(questId: string, updates: Partial<Quest>): Promise<Quest>;
async function deactivateQuest(questId: string): Promise<void>;

// Quest assignment and completion
async function assignQuestToUser(
  userId: string,
  guildId: string,
  questId: string
): Promise<UserQuest>;

async function getUserActiveQuest(
  userId: string,
  guildId: string
): Promise<UserQuest | null>;

async function completeUserQuest(
  userQuestId: string,
  identifier: string,
  xpAwarded: number
): Promise<void>;

async function failUserQuest(userQuestId: string, reason: string): Promise<void>;

async function getUserCompletedQuests(
  userId: string,
  guildId: string
): Promise<UserQuest[]>;

// XP management
async function getUserXP(userId: string, guildId: string): Promise<UserXP | null>;
async function upsertUserXP(
  userId: string,
  guildId: string,
  xpDelta: number
): Promise<UserXP>;

async function getGuildLeaderboard(
  guildId: string,
  limit: number
): Promise<UserXP[]>;

// Quest analytics
async function getQuestCompletionCount(questId: string): Promise<number>;
async function getQuestStats(questId: string): Promise<QuestStats>;
```

**Transaction Example:**
```typescript
async function awardQuestXP(
  userId: string,
  guildId: string,
  questId: string,
  xpAmount: number,
  userQuestId: string,
  identifier: string
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Mark quest as completed
    await client.query(
      'UPDATE user_quests SET status = $1, completed_at = NOW(), verification_identifier = $2, xp_awarded = $3 WHERE id = $4',
      ['completed', identifier, xpAmount, userQuestId]
    );

    // Award XP
    await client.query(
      `INSERT INTO user_xp (user_id, guild_id, total_xp, quests_completed, last_quest_at, updated_at)
       VALUES ($1, $2, $3, 1, NOW(), NOW())
       ON CONFLICT (user_id, guild_id)
       DO UPDATE SET
         total_xp = user_xp.total_xp + $3,
         quests_completed = user_xp.quests_completed + 1,
         last_quest_at = NOW(),
         updated_at = NOW()`,
      [userId, guildId, xpAmount]
    );

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
```

**Dependencies:**
- `src/db/connection.ts` (connection pool)
- `src/types/database.ts` (TypeScript types)

---

## Database Schema

> **Alignment Note:** This schema is designed to align with the Summon platform schema where applicable.
> Key mappings: `title` (Summon) = quest name, `points` (Summon) = XP in our system.
> We omit: campaigns, images, seasonal points, start/end dates, featured/onboarding flags.
> We add: Discord-specific fields (guild_id, verification via MCP).

### New Tables

**1. quests** (aligned with Summon CreateOrUpdateQuest schema)

```sql
-- Status enum for quest lifecycle (aligned with Summon's UpdateQuestStatus)
CREATE TYPE quest_status AS ENUM ('DRAFT', 'LIVE', 'PAUSED', 'ARCHIVED');

CREATE TABLE quests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id VARCHAR(32) NOT NULL,                    -- Discord-specific: guild isolation

  -- Core quest properties (aligned with Summon)
  title VARCHAR(100) NOT NULL,                      -- Summon: title (required)
  description TEXT CHECK (char_length(description) <= 1000), -- Summon: description (optional, AI can generate)
  points INTEGER NOT NULL CHECK (points > 0 AND points <= 10000), -- Summon: points (XP reward)
  app_url TEXT,                                     -- Summon: appUrl (external URL related to quest)

  -- Quest lifecycle (aligned with Summon UpdateQuestStatus)
  status quest_status NOT NULL DEFAULT 'DRAFT',    -- Summon: READY, LIVE, PAUSED (we add DRAFT, ARCHIVED)

  -- Completion limits (aligned with Summon task.maxCompletions)
  max_completions INTEGER CHECK (max_completions IS NULL OR max_completions > 0),

  -- MCP Verification (Discord bot specific - replaces Summon's mcpConnectorId concept)
  mcp_connector_id INTEGER,                         -- Summon: mcpConnectorId (optional, for MCP-based verification)
  verification_type VARCHAR(20) NOT NULL CHECK (verification_type IN ('email', 'discord_id', 'wallet_address')),
  api_endpoint TEXT NOT NULL,                       -- External API for verification
  api_params JSONB DEFAULT '{}',                    -- Parameters for API call

  -- Tags (aligned with Summon tags structure)
  tags JSONB DEFAULT '[]',                          -- Array of {name, color, tagTypeId} objects

  -- Future-proofing columns (Phase 2)
  priority INTEGER DEFAULT 0,                       -- For weighted assignment
  difficulty VARCHAR(20) CHECK (difficulty IS NULL OR difficulty IN ('easy', 'medium', 'hard')),

  -- Audit fields
  created_by VARCHAR(32) NOT NULL,                  -- Discord user ID of creator
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_quests_guild_status ON quests(guild_id, status) WHERE status = 'LIVE';
CREATE INDEX idx_quests_guild_all ON quests(guild_id);
CREATE INDEX idx_quests_mcp_connector ON quests(mcp_connector_id) WHERE mcp_connector_id IS NOT NULL;

-- Comments for clarity
COMMENT ON COLUMN quests.title IS 'Quest display name (Summon: title)';
COMMENT ON COLUMN quests.points IS 'XP awarded on completion (Summon: points)';
COMMENT ON COLUMN quests.status IS 'Quest lifecycle status (Summon: READY/LIVE/PAUSED, we add DRAFT/ARCHIVED)';
COMMENT ON COLUMN quests.mcp_connector_id IS 'Optional MCP connector ID for verification (Summon: mcpConnectorId)';
COMMENT ON COLUMN quests.tags IS 'JSON array of tag objects: [{name, color, tagTypeId}]';
```

**2. quest_dependencies** (aligned with Summon questDependencies - Phase 2)

```sql
-- Quest prerequisites/unlock order (aligned with Summon questDependencies)
CREATE TABLE quest_dependencies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quest_id UUID NOT NULL REFERENCES quests(id) ON DELETE CASCADE,
  depends_on_quest_id UUID NOT NULL REFERENCES quests(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Prevent duplicate dependencies and self-references
  UNIQUE(quest_id, depends_on_quest_id),
  CHECK (quest_id != depends_on_quest_id)
);

CREATE INDEX idx_quest_deps_quest ON quest_dependencies(quest_id);
CREATE INDEX idx_quest_deps_depends_on ON quest_dependencies(depends_on_quest_id);

COMMENT ON TABLE quest_dependencies IS 'Summon: questDependencies - quests that must be completed before this quest unlocks';
```

**3. quest_tags** (normalized tag reference table - Phase 2)

```sql
-- Normalized tag definitions (aligned with Summon tag structure)
CREATE TABLE quest_tags (
  id SERIAL PRIMARY KEY,
  guild_id VARCHAR(32) NOT NULL,                    -- Discord-specific: guild isolation
  name VARCHAR(50) NOT NULL,                        -- Summon: tag.name
  color VARCHAR(7) NOT NULL DEFAULT '#808080',      -- Summon: tag.color (hex)
  tag_type_id INTEGER NOT NULL DEFAULT 1,           -- Summon: tag.tagTypeId
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  UNIQUE(guild_id, name)
);

CREATE INDEX idx_quest_tags_guild ON quest_tags(guild_id);

COMMENT ON COLUMN quest_tags.name IS 'Tag name (Summon: tag.name)';
COMMENT ON COLUMN quest_tags.color IS 'Hex color for tag display (Summon: tag.color)';
COMMENT ON COLUMN quest_tags.tag_type_id IS 'Tag category identifier (Summon: tag.tagTypeId)';
```

**4. user_quests** (quest assignment and completion tracking)

```sql
-- User quest assignment status
CREATE TYPE user_quest_status AS ENUM ('assigned', 'completed', 'failed', 'expired');

CREATE TABLE user_quests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR(32) NOT NULL,
  guild_id VARCHAR(32) NOT NULL,
  quest_id UUID NOT NULL REFERENCES quests(id) ON DELETE CASCADE,

  status user_quest_status NOT NULL DEFAULT 'assigned',

  assigned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE,
  verification_identifier TEXT,                     -- Email, wallet, etc. (hashed or cleared after verification)
  points_awarded INTEGER DEFAULT 0,                 -- Aligned with Summon: points (was xp_awarded)

  -- Verification tracking
  verification_attempts INTEGER DEFAULT 0,
  last_verification_attempt TIMESTAMP WITH TIME ZONE,
  failure_reason TEXT,                              -- Why verification failed

  UNIQUE(user_id, quest_id, assigned_at)            -- Allow re-assignment after expiry
);

CREATE INDEX idx_user_quests_user_status ON user_quests(user_id, guild_id, status);
CREATE INDEX idx_user_quests_quest ON user_quests(quest_id, status);
CREATE INDEX idx_user_quests_assigned ON user_quests(user_id, guild_id, status)
  WHERE status = 'assigned';

COMMENT ON COLUMN user_quests.points_awarded IS 'XP earned for this quest (Summon: points)';
```

**5. user_xp** (XP/points aggregation per user per guild)

```sql
CREATE TABLE user_xp (
  user_id VARCHAR(32) NOT NULL,
  guild_id VARCHAR(32) NOT NULL,
  total_xp INTEGER DEFAULT 0 CHECK (total_xp >= 0), -- Display as "XP" to users, internally "points"
  quests_completed INTEGER DEFAULT 0 CHECK (quests_completed >= 0),
  last_quest_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  PRIMARY KEY (user_id, guild_id)
);

CREATE INDEX idx_user_xp_leaderboard ON user_xp(guild_id, total_xp DESC);
CREATE INDEX idx_user_xp_user ON user_xp(user_id, guild_id);

COMMENT ON COLUMN user_xp.total_xp IS 'Total points/XP earned (Summon: points, displayed as XP to users)';
```

**6. quest_creation_sessions** (conversational quest builder state)

```sql
CREATE TABLE quest_creation_sessions (
  session_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id VARCHAR(32) NOT NULL,
  guild_id VARCHAR(32) NOT NULL,
  stage VARCHAR(50) NOT NULL,                       -- 'title', 'points', 'verification_type', 'api_docs', 'confirmation'
  collected_data JSONB DEFAULT '{}',                -- Accumulated quest data
  channel_id VARCHAR(32),                           -- DM channel or guild channel
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,     -- 30 minute timeout
  completed BOOLEAN DEFAULT FALSE
);

CREATE INDEX idx_quest_sessions_creator ON quest_creation_sessions(creator_id, guild_id, completed);
CREATE INDEX idx_quest_sessions_expires ON quest_creation_sessions(expires_at) WHERE completed = FALSE;
```

### Schema Mapping Reference

| Summon Schema | Discord Bot Schema | Notes |
|---------------|-------------------|-------|
| `id` (number) | `id` (UUID) | UUIDs for Discord compatibility |
| `title` | `title` | Direct mapping |
| `description` | `description` | Direct mapping |
| `points` | `points` (displayed as "XP") | Direct mapping |
| `appUrl` | `app_url` | External quest URL |
| `status` (READY/LIVE/PAUSED) | `status` (DRAFT/LIVE/PAUSED/ARCHIVED) | Extended enum |
| `tags[]` | `tags` (JSONB) | Array of {name, color, tagTypeId} |
| `tasks[].mcpConnectorId` | `mcp_connector_id` | Single connector per quest (no multi-task) |
| `tasks[].maxCompletions` | `max_completions` | On quest level (no multi-task) |
| `questDependencies[]` | `quest_dependencies` table | Separate table for prerequisites |
| `campaignId` | N/A | Not implemented (no campaigns) |
| `imageUrl` | N/A | Not implemented |
| `seasonPoints` | N/A | Not implemented |
| `startAt`/`endAt` | N/A | Not implemented (Phase 2 potential) |
| `isFeatured`/`isOnboarding` | N/A | Not implemented |

### TypeScript Types (aligned with Summon Zod schema)

```typescript
// src/types/quest.ts

// Quest status enum (aligned with Summon)
export type QuestStatus = 'DRAFT' | 'LIVE' | 'PAUSED' | 'ARCHIVED';

// User quest status
export type UserQuestStatus = 'assigned' | 'completed' | 'failed' | 'expired';

// Verification types supported
export type VerificationType = 'email' | 'discord_id' | 'wallet_address';

// Tag structure (aligned with Summon)
export interface QuestTag {
  name: string;      // Tag name
  color: string;     // Hex color (e.g., "#FF5733")
  tagTypeId: number; // Tag category identifier
}

// Quest entity (aligned with Summon CreateOrUpdateQuest)
export interface Quest {
  id: string;                          // UUID
  guildId: string;                     // Discord guild ID
  title: string;                       // Summon: title
  description: string | null;          // Summon: description
  points: number;                      // Summon: points (XP reward)
  appUrl: string | null;               // Summon: appUrl
  status: QuestStatus;                 // Summon: status
  maxCompletions: number | null;       // Summon: tasks[].maxCompletions
  mcpConnectorId: number | null;       // Summon: tasks[].mcpConnectorId
  verificationType: VerificationType;
  apiEndpoint: string;
  apiParams: Record<string, unknown>;
  tags: QuestTag[];                    // Summon: tags[]
  priority: number;
  difficulty: 'easy' | 'medium' | 'hard' | null;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

// Quest dependency (aligned with Summon questDependencies)
export interface QuestDependency {
  id: string;
  questId: string;
  dependsOnQuestId: string;  // Summon: dependsOnQuestId
  createdAt: Date;
}

// User quest assignment
export interface UserQuest {
  id: string;
  userId: string;
  guildId: string;
  questId: string;
  status: UserQuestStatus;
  assignedAt: Date;
  completedAt: Date | null;
  verificationIdentifier: string | null;
  pointsAwarded: number;              // Summon: points (was xpAwarded)
  verificationAttempts: number;
  lastVerificationAttempt: Date | null;
  failureReason: string | null;
}

// User XP aggregate
export interface UserXP {
  userId: string;
  guildId: string;
  totalXp: number;                    // Displayed as "XP", internally "points"
  questsCompleted: number;
  lastQuestAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

// Create quest input (aligned with Summon CreateOrUpdateQuest)
export interface CreateQuestInput {
  guildId: string;
  title: string;                       // Required (Summon: title)
  description?: string;                // Optional, AI can generate
  points?: number;                     // Optional, AI can suggest
  appUrl?: string;                     // Optional
  status?: QuestStatus;                // Default: DRAFT
  maxCompletions?: number;             // Optional
  mcpConnectorId?: number;             // Optional
  verificationType: VerificationType;
  apiEndpoint: string;
  apiParams?: Record<string, unknown>;
  tags?: QuestTag[];                   // Optional
  createdBy: string;
}

// Update quest input
export interface UpdateQuestInput {
  title?: string;
  description?: string;
  points?: number;
  appUrl?: string;
  status?: QuestStatus;
  maxCompletions?: number;
  mcpConnectorId?: number;
  verificationType?: VerificationType;
  apiEndpoint?: string;
  apiParams?: Record<string, unknown>;
  tags?: QuestTag[];
}

// Quest list filters (aligned with Summon ListQuestsOrCampaigns)
export interface ListQuestsFilters {
  title?: string;                      // Summon: title (text search)
  status?: QuestStatus;                // Summon: status
  guildId: string;                     // Required for Discord
}
```

### Migration Strategy

**Migration File:** `src/db/migrations/002_questing_system.ts`

```typescript
import { PoolClient } from 'pg';

export async function up(client: PoolClient): Promise<void> {
  // Create enums
  await client.query(`
    CREATE TYPE quest_status AS ENUM ('DRAFT', 'LIVE', 'PAUSED', 'ARCHIVED');
    CREATE TYPE user_quest_status AS ENUM ('assigned', 'completed', 'failed', 'expired');
  `);

  // Create quests table
  await client.query(`
    CREATE TABLE quests (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      guild_id VARCHAR(32) NOT NULL,
      title VARCHAR(100) NOT NULL,
      description TEXT CHECK (char_length(description) <= 1000),
      points INTEGER NOT NULL CHECK (points > 0 AND points <= 10000),
      app_url TEXT,
      status quest_status NOT NULL DEFAULT 'DRAFT',
      max_completions INTEGER CHECK (max_completions IS NULL OR max_completions > 0),
      mcp_connector_id INTEGER,
      verification_type VARCHAR(20) NOT NULL CHECK (verification_type IN ('email', 'discord_id', 'wallet_address')),
      api_endpoint TEXT NOT NULL,
      api_params JSONB DEFAULT '{}',
      tags JSONB DEFAULT '[]',
      priority INTEGER DEFAULT 0,
      difficulty VARCHAR(20) CHECK (difficulty IS NULL OR difficulty IN ('easy', 'medium', 'hard')),
      created_by VARCHAR(32) NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );
  `);

  // Create quest indexes
  await client.query(`
    CREATE INDEX idx_quests_guild_status ON quests(guild_id, status) WHERE status = 'LIVE';
    CREATE INDEX idx_quests_guild_all ON quests(guild_id);
    CREATE INDEX idx_quests_mcp_connector ON quests(mcp_connector_id) WHERE mcp_connector_id IS NOT NULL;
  `);

  // Create quest_dependencies table (Phase 2 ready)
  await client.query(`
    CREATE TABLE quest_dependencies (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      quest_id UUID NOT NULL REFERENCES quests(id) ON DELETE CASCADE,
      depends_on_quest_id UUID NOT NULL REFERENCES quests(id) ON DELETE CASCADE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      UNIQUE(quest_id, depends_on_quest_id),
      CHECK (quest_id != depends_on_quest_id)
    );
    CREATE INDEX idx_quest_deps_quest ON quest_dependencies(quest_id);
    CREATE INDEX idx_quest_deps_depends_on ON quest_dependencies(depends_on_quest_id);
  `);

  // Create quest_tags table (Phase 2 ready)
  await client.query(`
    CREATE TABLE quest_tags (
      id SERIAL PRIMARY KEY,
      guild_id VARCHAR(32) NOT NULL,
      name VARCHAR(50) NOT NULL,
      color VARCHAR(7) NOT NULL DEFAULT '#808080',
      tag_type_id INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      UNIQUE(guild_id, name)
    );
    CREATE INDEX idx_quest_tags_guild ON quest_tags(guild_id);
  `);

  // Create user_quests table
  await client.query(`
    CREATE TABLE user_quests (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id VARCHAR(32) NOT NULL,
      guild_id VARCHAR(32) NOT NULL,
      quest_id UUID NOT NULL REFERENCES quests(id) ON DELETE CASCADE,
      status user_quest_status NOT NULL DEFAULT 'assigned',
      assigned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      completed_at TIMESTAMP WITH TIME ZONE,
      verification_identifier TEXT,
      points_awarded INTEGER DEFAULT 0,
      verification_attempts INTEGER DEFAULT 0,
      last_verification_attempt TIMESTAMP WITH TIME ZONE,
      failure_reason TEXT,
      UNIQUE(user_id, quest_id, assigned_at)
    );
    CREATE INDEX idx_user_quests_user_status ON user_quests(user_id, guild_id, status);
    CREATE INDEX idx_user_quests_quest ON user_quests(quest_id, status);
    CREATE INDEX idx_user_quests_assigned ON user_quests(user_id, guild_id, status) WHERE status = 'assigned';
  `);

  // Create user_xp table
  await client.query(`
    CREATE TABLE user_xp (
      user_id VARCHAR(32) NOT NULL,
      guild_id VARCHAR(32) NOT NULL,
      total_xp INTEGER DEFAULT 0 CHECK (total_xp >= 0),
      quests_completed INTEGER DEFAULT 0 CHECK (quests_completed >= 0),
      last_quest_at TIMESTAMP WITH TIME ZONE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      PRIMARY KEY (user_id, guild_id)
    );
    CREATE INDEX idx_user_xp_leaderboard ON user_xp(guild_id, total_xp DESC);
    CREATE INDEX idx_user_xp_user ON user_xp(user_id, guild_id);
  `);

  // Create quest_creation_sessions table
  await client.query(`
    CREATE TABLE quest_creation_sessions (
      session_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      creator_id VARCHAR(32) NOT NULL,
      guild_id VARCHAR(32) NOT NULL,
      stage VARCHAR(50) NOT NULL,
      collected_data JSONB DEFAULT '{}',
      channel_id VARCHAR(32),
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
      completed BOOLEAN DEFAULT FALSE
    );
    CREATE INDEX idx_quest_sessions_creator ON quest_creation_sessions(creator_id, guild_id, completed);
    CREATE INDEX idx_quest_sessions_expires ON quest_creation_sessions(expires_at) WHERE completed = FALSE;
  `);

  // Create updated_at trigger function (if not exists)
  await client.query(`
    CREATE OR REPLACE FUNCTION update_updated_at_column()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = NOW();
      RETURN NEW;
    END;
    $$ language 'plpgsql';
  `);

  // Create triggers for updated_at
  await client.query(`
    CREATE TRIGGER update_quests_updated_at BEFORE UPDATE ON quests
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    CREATE TRIGGER update_user_xp_updated_at BEFORE UPDATE ON user_xp
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  `);
}

export async function down(client: PoolClient): Promise<void> {
  // Drop triggers
  await client.query('DROP TRIGGER IF EXISTS update_quests_updated_at ON quests');
  await client.query('DROP TRIGGER IF EXISTS update_user_xp_updated_at ON user_xp');

  // Drop tables in reverse order of dependencies
  await client.query('DROP TABLE IF EXISTS quest_creation_sessions CASCADE');
  await client.query('DROP TABLE IF EXISTS user_xp CASCADE');
  await client.query('DROP TABLE IF EXISTS user_quests CASCADE');
  await client.query('DROP TABLE IF EXISTS quest_tags CASCADE');
  await client.query('DROP TABLE IF EXISTS quest_dependencies CASCADE');
  await client.query('DROP TABLE IF EXISTS quests CASCADE');

  // Drop enums
  await client.query('DROP TYPE IF EXISTS user_quest_status');
  await client.query('DROP TYPE IF EXISTS quest_status');
}
```

### Key Differences from Summon Schema

| Feature | Summon | Discord Bot | Reason |
|---------|--------|-------------|--------|
| **Tasks** | Quests contain multiple tasks | Quest = single task | Lighter version, simpler UX |
| **Campaigns** | Quests belong to campaigns | No campaigns | Not needed for Discord |
| **Images** | Quest and task images | No images | Discord embeds handle display |
| **Seasons** | Season points tracking | No seasons | Simpler XP system |
| **Scheduling** | startAt/endAt dates | No scheduling (Phase 1) | Can add in Phase 2 |
| **Featured/Onboarding** | Boolean flags | Not implemented | Not needed for Discord |
| **ID Type** | Numeric | UUID | Better for Discord integration |
| **Guild Isolation** | N/A | guild_id on all tables | Discord multi-server support |

---

## API Calls and Endpoints

### Discord Commands (Internal API)

**1. /quest Command**

```typescript
// src/commands/quest.ts
import { SlashCommandBuilder } from 'discord.js';

export const questCommand = new SlashCommandBuilder()
  .setName('quest')
  .setDescription('Get a quest assigned to you');

// Handler
export async function handleQuestCommand(
  interaction: ChatInputCommandInteraction
): Promise<void> {
  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

  // Check rate limit (5 per hour)
  if (!checkRateLimit(interaction.user.id, 'quest', 5)) {
    await interaction.editReply({
      content: `You've reached the rate limit. Try again in ${timeUntilReset} minutes.`
    });
    return;
  }

  // Check for existing active quest
  const activeQuest = await questService.getUserActiveQuest(
    interaction.user.id,
    interaction.guildId!
  );

  if (activeQuest) {
    // Show current quest instead of assigning new one
    const embed = createQuestEmbed(activeQuest, 'current');
    await interaction.editReply({ embeds: [embed] });
    return;
  }

  // Assign new quest
  const assignedQuest = await questService.assignQuest(
    interaction.user.id,
    interaction.guildId!
  );

  if (!assignedQuest) {
    await interaction.editReply({
      content: 'No quests are currently available. Check back later!'
    });
    return;
  }

  const embed = createQuestEmbed(assignedQuest, 'assigned');
  await interaction.editReply({ embeds: [embed] });
}
```

**2. /confirm Command**

```typescript
// src/commands/confirm.ts
import { SlashCommandBuilder } from 'discord.js';

export const confirmCommand = new SlashCommandBuilder()
  .setName('confirm')
  .setDescription('Confirm quest completion')
  .addStringOption(option =>
    option
      .setName('identifier')
      .setDescription('Your email, wallet address, or other verification info')
      .setRequired(true)
  );

// Handler
export async function handleConfirmCommand(
  interaction: ChatInputCommandInteraction
): Promise<void> {
  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

  // Check rate limit (5 per hour)
  if (!checkRateLimit(interaction.user.id, 'confirm', 5)) {
    await interaction.editReply({
      content: `You've reached the rate limit. Try again in ${timeUntilReset} minutes.`
    });
    return;
  }

  const identifier = interaction.options.getString('identifier', true);

  // Get user's active quest
  const activeQuest = await questService.getUserActiveQuest(
    interaction.user.id,
    interaction.guildId!
  );

  if (!activeQuest) {
    await interaction.editReply({
      content: 'You don\'t have an active quest. Run `/quest` to get one!'
    });
    return;
  }

  // Check verification attempt limit (10 per quest)
  if (activeQuest.verification_attempts >= 10) {
    await interaction.editReply({
      content: 'You\'ve reached the maximum verification attempts for this quest. Please contact a moderator.'
    });
    return;
  }

  // Verify quest completion
  try {
    const result = await questService.verifyQuestCompletion(
      interaction.user.id,
      interaction.guildId!,
      activeQuest.quest_id,
      identifier
    );

    if (result.verified) {
      const xpTotal = result.newTotalXP;
      const embed = new EmbedBuilder()
        .setColor('#00FF00')
        .setTitle('✅ Quest Complete!')
        .setDescription(`Congratulations! Your completion of **${activeQuest.name}** has been verified.`)
        .addFields(
          { name: '💰 XP Earned', value: `+${activeQuest.xp_reward} XP`, inline: true },
          { name: '📊 Total XP', value: `${xpTotal} XP`, inline: true }
        )
        .setFooter({ text: 'Run /quest to get your next adventure!' });

      await interaction.editReply({ embeds: [embed] });
    } else {
      const embed = new EmbedBuilder()
        .setColor('#FF0000')
        .setTitle('❌ Verification Failed')
        .setDescription(`We couldn't verify your quest completion for **${activeQuest.name}**.`)
        .addFields({
          name: 'Possible reasons:',
          value: '• The action hasn\'t been completed yet\n• The identifier provided doesn\'t match our records\n• There may be a delay in our verification system'
        })
        .setFooter({ text: result.message || 'Please try again later or contact a moderator.' });

      await interaction.editReply({ embeds: [embed] });
    }
  } catch (error) {
    logger.error('Verification error', { error });
    await interaction.editReply({
      content: 'An error occurred during verification. Please try again later.'
    });
  }
}
```

**3. /xp Command**

```typescript
// src/commands/xp.ts
import { SlashCommandBuilder } from 'discord.js';

export const xpCommand = new SlashCommandBuilder()
  .setName('xp')
  .setDescription('View your XP and completed quests');

export async function handleXPCommand(
  interaction: ChatInputCommandInteraction
): Promise<void> {
  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

  // Check rate limit (5 per hour)
  if (!checkRateLimit(interaction.user.id, 'xp', 5)) {
    await interaction.editReply({
      content: `You've reached the rate limit. Try again in ${timeUntilReset} minutes.`
    });
    return;
  }

  const progress = await questService.getUserXPProgress(
    interaction.user.id,
    interaction.guildId!
  );

  if (!progress || progress.totalXP === 0) {
    await interaction.editReply({
      content: 'You haven\'t completed any quests yet! Run `/quest` to get started.'
    });
    return;
  }

  // Build completed quests list
  const completedList = progress.completedQuests
    .slice(0, 10) // Show last 10
    .map(q => `├─ ${q.name} (+${q.xp_awarded} XP) - ${formatDate(q.completed_at)}`)
    .join('\n');

  const currentQuestText = progress.currentQuest
    ? `└─ ${progress.currentQuest.name} (${progress.currentQuest.xp_reward} XP) - Assigned ${formatDate(progress.currentQuest.assigned_at)}`
    : '└─ None (run `/quest` to get one!)';

  const embed = new EmbedBuilder()
    .setColor('#5865F2')
    .setTitle('📊 Your Quest Progress')
    .addFields(
      { name: '⭐ Total XP', value: progress.totalXP.toString(), inline: true },
      { name: '🏆 Quests Completed', value: progress.questsCompleted.toString(), inline: true },
      { name: '\u200B', value: '\u200B', inline: true } // Spacer
    )
    .setDescription(
      `**🏆 Completed Quests (${progress.questsCompleted}):**\n${completedList}\n\n**🎯 Current Quest:**\n${currentQuestText}`
    )
    .setFooter({ text: 'Keep questing to climb the leaderboard!' })
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}
```

### External API Calls (via Summon MCP)

**Summon MCP SSE Endpoint**

```typescript
// Example MCP call structure (hypothetical, needs actual MCP docs)

// POST https://summon-ai-mcp-development.game7-workers.workers.dev/sse
// Headers:
//   Authorization: Bearer MCP_TOKEN
//   Content-Type: application/json

// Request body for verification
{
  "tool": "verify_quest",
  "arguments": {
    "api_endpoint": "https://api.opensea.io/v2/chain/ethereum/account/{wallet}/nfts",
    "api_params": {
      "wallet": "{{user_identifier}}"
    },
    "verification_logic": {
      "type": "balance_check",
      "field": "nfts.length",
      "operator": ">",
      "value": 0
    }
  }
}

// Response (SSE stream)
data: {"verified": true, "message": "NFT balance found", "metadata": {"balance": 5}}

// Request body for quest structuring
{
  "tool": "structure_quest",
  "arguments": {
    "api_documentation": "...", // Full API docs as string
    "quest_description": "Mint your first NFT on our platform",
    "verification_requirement": "User must have at least 1 NFT"
  }
}

// Response
data: {
  "api_endpoint": "https://api.opensea.io/v2/chain/ethereum/account/{wallet}/nfts",
  "api_params": {"wallet": "{{user_identifier}}"},
  "verification_type": "wallet_address",
  "verification_field": "nfts.length",
  "verification_logic": {"operator": ">", "value": 0}
}
```

---

## Implementation Plan

### Phase 1: Foundation

**Milestone 1.1: Database Setup**
- Create migration file `002_questing_system.ts`
- Implement all four new tables (quests, user_quests, user_xp, quest_creation_sessions)
- Add indexes and triggers
- Write database query functions in `questQueries.ts`
- Test migrations on development database

**Deliverable:** Working database schema with migration scripts

**Milestone 1.2: MCP Client Service**
- Research Summon MCP API documentation (requires API docs - see OPEN QUESTIONS)
- Implement `mcpClient.ts` with SSE connection handling
- Add authentication and timeout logic
- Create mock MCP responses for testing
- Write unit tests for MCP client

**Deliverable:** MCP client service with test coverage

**Dependencies:** Requires Summon MCP API documentation

---

### Phase 2: Core Quest Flow

**Milestone 2.1: Quest Assignment (/quest command)**
- Implement `questService.assignQuest()` method
- Implement quest assignment algorithm (random selection with filtering)
- Create `/quest` command handler in `commands/quest.ts`
- Add quest assignment embed UI
- Add rate limiting for /quest command
- Handle edge cases (no quests, all completed, existing active quest)
- Write integration tests

**Deliverable:** Working `/quest` command with quest assignment

**Milestone 2.2: Quest Verification (/confirm command)**
- Implement `questService.verifyQuestCompletion()` method
- Integrate MCP client for external verification
- Create `/confirm` command handler in `commands/confirm.ts`
- Implement XP award transaction logic
- Add success/failure response embeds
- Add verification attempt tracking (10 attempt limit)
- Write integration tests

**Deliverable:** Working `/confirm` command with verification and XP awards

**Dependencies:** Milestone 1.2 (MCP Client)

---

### Phase 3: XP Tracking

**Milestone 3.1: XP Display (/xp command)**
- Implement `questService.getUserXPProgress()` method
- Create `/xp` command handler in `commands/xp.ts`
- Design XP progress embed UI
- Add completed quests history display
- Add current quest display
- Write integration tests

**Deliverable:** Working `/xp` command with full progress display

**Milestone 3.2: XP System Integration**
- Ensure atomic XP transactions
- Add XP validation (non-negative totals)
- Implement leaderboard query (for future use)
- Add analytics logging for XP trends
- Performance testing for high-concurrency scenarios

**Deliverable:** Robust, transactional XP system

---

### Phase 4: Quest Creation

**Milestone 4.1: Conversational Quest Builder**
- Implement `questCreationService.ts`
- Add conversation state management (in-memory cache with TTL)
- Implement quest creation intent detection
- Create multi-turn conversation flow
- Add message handler in `messageCreate.ts` for quest creation
- Implement admin/moderator permission validation
- Write conversation flow tests

**Deliverable:** Conversational quest creation interface

**Milestone 4.2: Documentation Parser Integration**
- Implement `parseAPIDocumentation()` using WebFetch tool
- Add API endpoint extraction logic
- Integrate with Claude for API schema understanding
- Add validation for API URLs and endpoints
- Handle various documentation formats (OpenAPI, manual docs)
- Write parser tests with example API docs

**Deliverable:** API documentation parser

**Milestone 4.3: MCP Quest Structuring**
- Implement `structureQuestWithMCP()` method
- Call Summon MCP with API docs and quest description
- Parse MCP response into quest object
- Validate MCP-generated quest structure
- Save structured quest to database
- Add confirmation step before activation
- Write integration tests

**Deliverable:** End-to-end quest creation flow

**Dependencies:** Milestone 1.2 (MCP Client), Requires MCP quest structuring API

---

### Phase 5: Testing & Polish

**Milestone 5.1: Comprehensive Testing**
- Unit tests for all service methods (90% coverage target)
- Integration tests for command handlers
- End-to-end tests for complete quest flows
- Load testing for concurrent verification requests
- Edge case testing (timeouts, invalid data, race conditions)
- Security testing (SQL injection, XSS in quest descriptions)

**Deliverable:** Comprehensive test suite

**Milestone 5.2: Documentation & Deployment**
- Update CLAUDE.md with questing system details
- Create admin guide for quest creation
- Create user guide for quest participation
- Add error handling improvements based on testing
- Performance optimization (query tuning, caching)
- Deploy to staging environment
- User acceptance testing with beta server

**Deliverable:** Production-ready questing system

**Milestone 5.3: Monitoring & Analytics**
- Add Prometheus metrics for quest completion rates
- Add dashboard for quest analytics
- Set up alerts for MCP failures and verification errors
- Add logging for quest trends and user behavior
- Create admin analytics queries

**Deliverable:** Observability infrastructure

---

### Phase 6: Future Enhancements (Post-POC)

**Not in Phase 1, but schema supports:**
- Quest expiration (expires_at column present)
- Quest difficulty levels (difficulty column present)
- Quest categories/tags (tags column present)
- Quest priority weighting (priority column present)
- Quest editing by admins
- Quest deactivation without deletion
- Recurring quests
- Team quests
- Server leaderboards with `/leaderboard` command

---

## Technical Risks & Mitigations

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| **Summon MCP API Undefined** | Critical - Cannot implement verification | High | **BLOCKER** - Obtain MCP API docs immediately. Create mock MCP service for parallel development. |
| **MCP SSE Connection Instability** | High - Verification failures | Medium | Implement retry logic with exponential backoff. Add fallback to polling. Timeout after 10s as specified. |
| **External API Rate Limits** | Medium - Verification delays | Medium | Implement user-side rate limiting (5/hr). Cache negative results temporarily. Queue verification requests. |
| **Database Transaction Deadlocks** | Medium - XP award failures | Low | Use optimistic locking. Retry transactions with exponential backoff. Add transaction timeout. |
| **Conversation State Memory Leak** | Low - Memory exhaustion | Medium | Implement aggressive TTL (30 min). Add session cleanup background task. Limit max concurrent sessions per user. |
| **Quest Description XSS** | High - Security vulnerability | Low | Sanitize all user input. Use Discord's markdown escaping. Validate description length (1000 char limit). |
| **Concurrent Quest Verification** | Medium - Duplicate XP awards | Low | Use database transactions with SERIALIZABLE isolation. Add unique constraint on user_quests. |
| **Documentation Parser Failure** | Medium - Quest creation failures | Medium | Provide manual API endpoint entry fallback. Support multiple doc formats. Add validation step before MCP call. |
| **Scale: 1000+ Concurrent Users** | Medium - Performance degradation | Low | Use connection pooling (already implemented). Add Redis for session state. Implement quest caching. |
| **Admin Permission Bypass** | High - Unauthorized quest creation | Very Low | Triple-check permissions: Discord API + database + bot logic. Audit log all quest creations. |

---

## Recommendations

### Architecture Decisions

1. **Use Existing Rate Limiter Pattern**
   - Reuse `src/utils/rateLimiter.ts` from catchup command
   - Extend to support per-command rate limits
   - Rationale: Consistency, less code duplication

2. **Separate Quest Creation Service**
   - Don't overload questService.ts with conversation logic
   - Keep questCreationService.ts focused on conversation flow
   - Rationale: Single responsibility, easier testing

3. **In-Memory Conversation State (for now)**
   - Use Map with TTL for quest creation sessions
   - Don't persist to database until quest is completed
   - Rationale: Simpler implementation, low stakes if lost
   - Trade-off: State lost on bot restart (acceptable for Phase 1)

4. **Transaction-Based XP Awards**
   - Always use PostgreSQL transactions for XP changes
   - Never award XP without marking quest complete
   - Rationale: Data integrity is critical for user trust

5. **Flexible Verification Logic**
   - Support multiple response schemas from external APIs
   - Let MCP handle response parsing complexity
   - Rationale: Different APIs return data in different formats

6. **Admin Quest Creation via Messages (not slash commands)**
   - Use conversational interface in DMs or admin channels
   - More natural for complex, multi-step process
   - Rationale: Better UX for admins, leverages Claude's strengths

### Performance Optimizations

1. **Quest List Caching**
   - Cache active quests per guild for 5 minutes
   - Invalidate on quest creation/deactivation
   - Expected impact: 80% reduction in database queries for quest assignment

2. **User XP Caching**
   - Cache user XP totals for 1 minute
   - Invalidate on XP award
   - Expected impact: Faster /xp command responses

3. **Database Indexes**
   - All critical queries have indexes defined
   - Monitor slow queries with `pg_stat_statements`
   - Add covering indexes if needed based on usage patterns

4. **MCP Request Pooling**
   - If multiple users verify same quest type simultaneously, deduplicate MCP calls
   - Expected impact: Reduced MCP load, faster verification

### Security Best Practices

1. **Input Sanitization**
   - Sanitize all user inputs (quest names, descriptions, identifiers)
   - Use parameterized queries (already standard in codebase)
   - Escape markdown in Discord embeds

2. **Permission Validation**
   - Check admin permissions at multiple layers (Discord API, database, bot logic)
   - Log all permission checks for audit trail

3. **Rate Limiting**
   - Enforce rate limits at bot level (don't rely on Discord alone)
   - Add per-guild rate limits for quest creation (10/day)

4. **API Security**
   - Store MCP token in environment variable (never in code/database)
   - Use HTTPS for all external API calls
   - Validate API responses before processing

---

## Next Steps

### Immediate Actions (Before Starting Implementation)

1. ✅ **Review this implementation plan with product and engineering teams**
2. ❌ **Obtain Summon MCP API documentation** - CRITICAL BLOCKER
3. ❌ **Clarify Documentation Reader Skill** - CRITICAL BLOCKER
4. ⚠️ **Decide on quest creation trigger mechanism** - HIGH PRIORITY
5. ⚠️ **Confirm verification response schema** - HIGH PRIORITY
6. ⚠️ **Test Summon MCP SSE endpoint** - Verify connectivity and authentication
7. ✅ **Set up development database** - Create questing schema
8. ✅ **Create GitHub issues for each milestone** - Track progress

### Tasks After Blockers Resolved

1. Run database migration for questing tables
2. Implement `questQueries.ts` with all database operations
3. Implement `mcpClient.ts` with mock responses for testing
4. Write unit tests for database queries
5. Begin `/quest` command implementation
6. Set up test environment with sample quests

### Success Criteria for Phase 1 POC

- [ ] Admins can create quests via conversational interface
- [ ] Users can get quests assigned with `/quest` command
- [ ] Users can verify quest completion with `/confirm` command
- [ ] XP is correctly awarded and tracked
- [ ] Users can view their XP and completed quests with `/xp` command
- [ ] All commands are rate-limited appropriately
- [ ] Error handling provides helpful user feedback
- [ ] Database transactions prevent duplicate XP awards
- [ ] Logging captures all quest operations for debugging
- [ ] System handles 100+ concurrent users without performance degradation

---

## Appendix: File Checklist

### New Files to Create

**Services:**
- [ ] `src/services/questService.ts` - Main quest orchestration
- [ ] `src/services/questCreationService.ts` - Conversational quest builder
- [ ] `src/services/mcpClient.ts` - Summon MCP integration
- [ ] `src/services/questVerificationService.ts` - Verification logic (optional abstraction)

**Commands:**
- [ ] `src/commands/quest.ts` - /quest command handler
- [ ] `src/commands/confirm.ts` - /confirm command handler
- [ ] `src/commands/xp.ts` - /xp command handler

**Database:**
- [ ] `src/db/questQueries.ts` - Quest database operations
- [ ] `src/db/migrations/002_questing_system.ts` - Questing schema migration

**Types:**
- [ ] `src/types/quest.ts` - Quest TypeScript types and interfaces

**Tests:**
- [ ] `tests/services/questService.test.ts` - Quest service unit tests
- [ ] `tests/services/mcpClient.test.ts` - MCP client tests
- [ ] `tests/commands/quest.test.ts` - /quest command tests
- [ ] `tests/commands/confirm.test.ts` - /confirm command tests
- [ ] `tests/commands/xp.test.ts` - /xp command tests
- [ ] `tests/integration/questFlow.test.ts` - End-to-end quest flow tests

**Documentation:**
- [ ] `.claude/subagents/quest-creator.md` - Quest creation AI subagent guide (optional)

### Files to Modify

**Bot Core:**
- [ ] `src/bot/commandRegistry.ts` - Add quest commands
- [ ] `src/bot/events/interactionCreate.ts` - Add quest command handlers
- [ ] `src/bot/events/messageCreate.ts` - Add quest creation conversation handler

**Configuration:**
- [ ] `.env.example` - Add MCP_TOKEN and quest-related config
- [ ] `src/index.ts` - Initialize quest services

**Documentation:**
- [ ] `CLAUDE.md` - Add questing system documentation to changelog
- [ ] `README.md` - Add quest commands to usage guide

### Dependencies to Add

```json
// package.json additions (if needed)
{
  "dependencies": {
    // Potential additions for MCP SSE connection
    "eventsource": "^2.0.2",  // If native fetch doesn't suffice
    "node-fetch": "^3.3.0"     // If targeting older Node versions
  }
}
```

---

**End of Implementation Plan**

**Last Updated:** 2026-01-16
**Plan Author:** Claude (Senior Software Architect AI)
**Status:** Ready for Review - BLOCKERS IDENTIFIED
