# Quest Builder MCP Integration Architecture

## Overview

This document outlines how the Discord bot should integrate with the Summon Quest Builder MCP to create and validate quest completion connectors.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           QUEST CREATION FLOW                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Admin DM/Mention                                                            │
│        │                                                                     │
│        ▼                                                                     │
│  ┌─────────────┐    "Read API docs"     ┌──────────────────┐                │
│  │  Discord    │ ───────────────────►   │ Documentation    │                │
│  │  Bot        │                        │ Reader Skill     │                │
│  └─────────────┘                        └────────┬─────────┘                │
│        │                                         │                          │
│        │  Connector Definition                   │ Parsed API structure     │
│        │  (endpoint, method, validation)         │                          │
│        ▼                                         ▼                          │
│  ┌─────────────────────────────────────────────────────────┐                │
│  │                    AI Assistant                          │                │
│  │  - Generates connector JSON                              │                │
│  │  - Creates validationFn DSL                              │                │
│  │  - Maps user input to placeholders                       │                │
│  └─────────────────────────────────────────────────────────┘                │
│        │                                                                     │
│        │  CreateOrUpdateConnector                                            │
│        ▼                                                                     │
│  ┌─────────────────────────────────────────────────────────┐                │
│  │              Quest Builder MCP                           │                │
│  │  - Validates connector schema                            │                │
│  │  - Stores connector definition                           │                │
│  │  - Returns connector_id                                  │                │
│  └─────────────────────────────────────────────────────────┘                │
│        │                                                                     │
│        │  connector_id                                                       │
│        ▼                                                                     │
│  ┌─────────────────────────────────────────────────────────┐                │
│  │              PostgreSQL Database                         │                │
│  │  quests table: stores connector_id + quest metadata      │                │
│  └─────────────────────────────────────────────────────────┘                │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                         QUEST VERIFICATION FLOW                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  User: /confirm identifier:0x123...                                          │
│        │                                                                     │
│        ▼                                                                     │
│  ┌─────────────┐                        ┌──────────────────┐                │
│  │  Discord    │  Get active quest      │   PostgreSQL     │                │
│  │  Bot        │ ◄─────────────────────►│   Database       │                │
│  └─────────────┘  (includes connector_id)└──────────────────┘                │
│        │                                                                     │
│        │  testConnector(id, mode="validate", variables)                      │
│        ▼                                                                     │
│  ┌─────────────────────────────────────────────────────────┐                │
│  │              Quest Builder MCP                           │                │
│  │  1. Load connector by ID                                 │                │
│  │  2. Replace {{walletAddress}} with user's 0x123...       │                │
│  │  3. Inject {{apiKey}} from env vars                      │                │
│  │  4. Call external API                                    │                │
│  │  5. Apply validationFn DSL                               │                │
│  │  6. Return { isValid: true/false, data: {...} }          │                │
│  └─────────────────────────────────────────────────────────┘                │
│        │                                                                     │
│        │  { isValid: true }                                                  │
│        ▼                                                                     │
│  ┌─────────────┐                                                            │
│  │  Discord    │  Award XP, mark complete                                   │
│  │  Bot        │ ────────────────────────►                                  │
│  └─────────────┘                                                            │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Database Schema Changes

### Current Schema (Direct API)

```sql
CREATE TABLE quests (
  id UUID PRIMARY KEY,
  ...
  api_endpoint TEXT NOT NULL,
  api_method VARCHAR(10),
  api_headers JSONB,
  api_params JSONB,
  success_condition JSONB,
  ...
);
```

### Proposed Schema (MCP-Mediated)

```sql
CREATE TABLE quests (
  id UUID PRIMARY KEY,
  guild_id VARCHAR(20) NOT NULL,
  name VARCHAR(100) NOT NULL,
  description TEXT NOT NULL,
  xp_reward INTEGER NOT NULL,

  -- MCP Connector reference
  connector_id INTEGER NOT NULL,           -- ID from Quest Builder MCP
  connector_name VARCHAR(100),             -- Human-readable name for reference

  -- User input configuration
  verification_type VARCHAR(30) NOT NULL,  -- 'wallet_address', 'email', 'twitter_handle'
  user_input_placeholder VARCHAR(50),      -- e.g., '{{walletAddress}}'
  user_input_description VARCHAR(200),     -- Instructions shown to user

  -- Quest settings
  active BOOLEAN DEFAULT true,
  max_completions INTEGER,
  total_completions INTEGER DEFAULT 0,

  -- Audit
  created_by VARCHAR(20) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

## MCP Connector Definition Mapping

### Verification Type → Placeholder Mapping

| Verification Type | MCP Placeholder     | Example Value           |
|-------------------|---------------------|-------------------------|
| `wallet_address`  | `{{walletAddress}}` | `0x1234...abcd`         |
| `email`           | `{{emailAddress}}`  | `user@example.com`      |
| `discord_id`      | `{{discordId}}`     | `123456789012345678`    |
| `twitter_handle`  | `{{twitterHandle}}` | `@username`             |

### API Key Handling

1. Admin specifies env var name during quest creation (e.g., `OPENSEA_API_KEY`)
2. Bot stores the env var name, not the actual key
3. MCP backend reads the actual key from its environment
4. Key is injected via `{{apiKey}}` placeholder at runtime

**Quest Creation Flow:**
```
Admin: "The API key is stored in OPENSEA_API_KEY"
Bot: Stores { api_key_env_var: "OPENSEA_API_KEY" }
MCP: Connector endpoint uses {{apiKey}}, backend injects process.env.OPENSEA_API_KEY
```

## Connector Examples

### Example 1: NFT Balance Check (OpenSea)

```json
{
  "name": "Check NFT Ownership - CoolCollection",
  "description": "Verifies user owns at least 1 NFT from CoolCollection",
  "endpoint": "https://api.opensea.io/api/v2/chain/ethereum/account/{{walletAddress}}/nfts?collection=cool-collection",
  "method": "GET",
  "headers": {
    "X-API-KEY": "{{apiKey}}",
    "Accept": "application/json"
  },
  "body": {},
  "validationPrompt": "User must own at least 1 NFT from this collection",
  "validationFn": {
    "op": "count",
    "path": "nfts",
    "compare": ">",
    "value": 0
  }
}
```

### Example 2: Token Balance Check

```json
{
  "name": "Check Token Balance",
  "description": "Verifies user has staked at least 100 tokens",
  "endpoint": "https://api.protocol.xyz/v1/users/{{walletAddress}}/staking",
  "method": "GET",
  "headers": {
    "Authorization": "Bearer {{apiKey}}"
  },
  "body": {},
  "validationPrompt": "User must have staked at least 100 tokens",
  "validationFn": {
    "op": "compare",
    "path": "data.stakedAmount",
    "compare": ">=",
    "value": 100
  }
}
```

### Example 3: Event Attendance (Multiple Conditions)

```json
{
  "name": "Community Event Attendance",
  "description": "Verifies user attended the community AMA",
  "endpoint": "https://api.events.xyz/attendees?email={{emailAddress}}&event_id=ama-2026-01",
  "method": "GET",
  "headers": {},
  "body": {},
  "validationPrompt": "User must have attended the event and stayed for at least 30 minutes",
  "validationFn": {
    "op": "compare",
    "path": "attendance.durationMinutes",
    "where": { "status": "attended" },
    "compare": ">=",
    "value": 30
  }
}
```

### Example 4: Sum of Transactions

```json
{
  "name": "Trading Volume Check",
  "description": "Verifies user has traded at least 1 ETH worth",
  "endpoint": "https://api.dex.xyz/v1/trades/{{walletAddress}}",
  "method": "GET",
  "headers": {
    "X-API-KEY": "{{apiKey}}"
  },
  "body": {},
  "validationPrompt": "Total trading volume must be at least 1 ETH",
  "validationFn": {
    "op": "sum",
    "path": "trades.volumeEth",
    "compare": ">=",
    "value": 1.0
  }
}
```

## Service Layer Changes

### QuestService Updates

```typescript
// src/services/questService.ts

import { mcpClient } from './mcpClient';

/**
 * Verify quest completion via MCP
 */
async function verifyQuestCompletion(
  userId: string,
  guildId: string,
  identifier: string
): Promise<{ success: boolean; message: string; xpAwarded?: number }> {

  const activeQuest = await db.getUserActiveQuest(userId, guildId);
  if (!activeQuest) {
    return { success: false, message: "No active quest" };
  }

  // Build variables object for MCP
  const variables: Record<string, string> = {};

  switch (activeQuest.verification_type) {
    case 'wallet_address':
      variables.walletAddress = identifier;
      break;
    case 'email':
      variables.emailAddress = identifier;
      break;
    case 'twitter_handle':
      variables.twitterHandle = identifier;
      break;
    case 'discord_id':
      variables.discordId = identifier;
      break;
  }

  // Call MCP to validate
  const result = await mcpClient.testConnector({
    id: activeQuest.connector_id,
    mode: 'validate',
    variables
  });

  if (result.isValid) {
    // Award XP and complete quest
    await db.completeUserQuest(activeQuest.id, activeQuest.xp_reward);
    await db.addUserXp(userId, guildId, activeQuest.xp_reward);

    return {
      success: true,
      message: `Quest completed! You earned ${activeQuest.xp_reward} XP.`,
      xpAwarded: activeQuest.xp_reward
    };
  }

  return {
    success: false,
    message: "Quest verification failed. Please ensure you've completed the required action."
  };
}
```

### MCP Client Service

```typescript
// src/services/mcpClient.ts

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

interface ConnectorDefinition {
  name: string;
  description?: string;
  endpoint: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  headers: Record<string, string>;
  body: Record<string, unknown>;
  validationPrompt?: string;
  validationFn?: ValidationDSL;
}

interface ValidationDSL {
  op: 'sum' | 'count' | 'compare' | 'exists';
  path: string;
  where?: WhereClause;
  compare?: '=' | '!=' | '>' | '>=' | '<' | '<=';
  value?: number | string | boolean;
}

interface WhereClause {
  and?: Array<Record<string, unknown>>;
  or?: Array<Record<string, unknown>>;
  [key: string]: unknown;
}

interface TestConnectorParams {
  id: number;
  mode: 'fetch' | 'validate';
  variables?: Record<string, string>;
}

interface TestConnectorResult {
  endpoint: string;
  method: string;
  status: number;
  isValid?: boolean;
  data: unknown;
}

class MCPClient {
  private client: Client | null = null;

  async connect(): Promise<void> {
    const transport = new StdioClientTransport({
      command: 'npx',
      args: ['-y', '@anthropic/quest-builder-mcp'],
      env: {
        ...process.env,
        // MCP will read API keys from these env vars
      }
    });

    this.client = new Client(
      { name: 'discord-quest-bot', version: '1.0.0' },
      { capabilities: {} }
    );

    await this.client.connect(transport);
  }

  async createConnector(definition: ConnectorDefinition): Promise<{ id: number }> {
    if (!this.client) throw new Error('MCP client not connected');

    const result = await this.client.callTool({
      name: 'createOrUpdateConnector',
      arguments: definition
    });

    return result.content[0] as { id: number };
  }

  async testConnector(params: TestConnectorParams): Promise<TestConnectorResult> {
    if (!this.client) throw new Error('MCP client not connected');

    const result = await this.client.callTool({
      name: 'testConnector',
      arguments: params
    });

    return result.content[0] as TestConnectorResult;
  }
}

export const mcpClient = new MCPClient();
```

## Quest Creation Prompt Updates

The AI assistant prompt should be updated to generate MCP-compatible connector definitions:

```typescript
export const QUEST_BUILDER_SYSTEM_PROMPT = `
You are a Quest Builder assistant that creates verification connectors for a Discord quest system.

When an admin wants to create a quest, you must:

1. Understand what action users need to complete
2. Identify the API endpoint that can verify this action
3. Generate a CONNECTOR DEFINITION in valid JSON

## Connector Structure

{
  "name": "Human-readable connector name",
  "description": "What this connector verifies",
  "endpoint": "https://api.example.com/path/{{walletAddress}}",
  "method": "GET",
  "headers": {
    "Authorization": "Bearer {{apiKey}}"
  },
  "body": {},
  "validationPrompt": "Natural language explanation",
  "validationFn": {
    "op": "count|sum|compare|exists",
    "path": "data.items",
    "compare": ">",
    "value": 0
  }
}

## Placeholder Rules

- {{walletAddress}} - User's wallet address
- {{emailAddress}} - User's email
- {{twitterHandle}} - User's Twitter handle
- {{discordId}} - User's Discord ID
- {{apiKey}} - API key (injected from env var, NEVER expose)

## Validation DSL Rules

Operations:
- "count": Count array items, compare to threshold
- "sum": Sum numeric values, compare to threshold
- "compare": Compare single value
- "exists": Check field exists

Path rules:
- Use dot notation: "data.user.balance"
- NO array indices: "items[0]" is FORBIDDEN
- NO wildcards: "items.*" is FORBIDDEN

## API Key Handling

Ask the admin: "What environment variable contains the API key?"
Store only the variable NAME, never the actual key.
The MCP backend will inject the real value.

## Confirmation Flow

Before creating, always show:
1. Quest summary (name, description, XP)
2. Connector JSON definition
3. What users will need to provide

Ask: "Should I create this quest?"
`;
```

## Migration Path

### Phase 1: Add MCP Support (Parallel)
1. Add `connector_id` column to quests table (nullable)
2. Implement MCP client service
3. Update quest creation to optionally use MCP
4. Keep existing direct API validation as fallback

### Phase 2: Migrate Existing Quests
1. For each quest with raw API config, create MCP connector
2. Update quest record with connector_id
3. Test validation still works

### Phase 3: Remove Direct API (Cleanup)
1. Remove `api_endpoint`, `api_headers`, etc. columns
2. Remove direct API calling code from questService
3. All validation goes through MCP

## Benefits of MCP Integration

1. **Security**: API keys never leave the backend
2. **Consistency**: Validation logic is standardized DSL
3. **Reusability**: Connectors can be shared across quests
4. **Testability**: MCP provides `fetch` mode for debugging
5. **Maintainability**: Connector updates don't require bot deploys
