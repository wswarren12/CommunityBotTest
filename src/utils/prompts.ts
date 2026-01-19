/**
 * Prompt templates for AI-powered features
 * These prompts define how Claude behaves in different contexts
 */

/**
 * Documentation Reader Skill
 * Used during quest creation to parse API docs and generate verification curl commands
 */
export const DOCUMENTATION_READER_SKILL = `
# Curl Command Builder

Build and test curl commands for REST API GET requests by reading API documentation.

## Workflow

### Step 1: Gather Requirements

Ask the user for:
1. **Documentation URL** - Link to the API docs (HTML or Swagger/OpenAPI spec)
2. **Desired action** - What data they want to retrieve (e.g., "check if user minted NFT", "verify token balance")

If the user doesn't know what action they want, proceed to Step 2 to help them discover available endpoints.

### Step 2: Read and Parse Documentation

**Fetch the documentation URL using web_fetch.** If the fetch fails, ask the user to copy and paste the relevant documentation sections.

**For Swagger/OpenAPI specs:**
- Look for the \`paths\` object containing endpoint definitions
- Filter to GET methods only
- Extract: path, summary, parameters, and response schema

**For HTML documentation:**
- Identify the endpoints section/navigation
- Locate GET request descriptions
- Extract: URL pattern, query parameters, headers, and example responses

**Present endpoints in plain English:**
For each relevant GET endpoint, explain:
- **What it does** - One sentence description
- **Required inputs** - Parameters the user must provide (path params, query params, headers)
- **What it returns** - Description of the response data

Example format:
\`\`\`
1. Get User NFT Balance
   - What it does: Returns the number of NFTs owned by a wallet address in a collection
   - Required inputs: API key, wallet address, contract address
   - Returns: Balance as integer (0 = not owned, >0 = owned)
\`\`\`

If the user's desired action doesn't match any endpoint, present the closest options and let them choose.

### Step 3: Generate Curl Command

Once the user confirms the endpoint, create a curl command with:

**Placeholder format for required values:**
- Use \`[DESCRIPTION]\` format in SCREAMING_SNAKE_CASE
- Examples: \`[API_KEY]\`, \`[WALLET_ADDRESS]\`, \`[EMAIL_ADDRESS]\`, \`[CONTRACT_ADDRESS]\`

**Standard curl structure:**
\`\`\`bash
curl -X GET "https://api.example.com/endpoint?param=[PARAM_VALUE]" \\
  -H "Authorization: Bearer [API_KEY]" \\
  -H "Content-Type: application/json"
\`\`\`

**Include in the command:**
- Full URL with path and query parameters
- Required headers (Authorization, Content-Type, custom headers)
- Any required query string parameters

**Explain where to find each placeholder value:**
- **API keys**: Usually found in developer portal, account settings, or API dashboard
- **Wallet addresses**: User provides their own wallet address
- **Other values**: Describe what format is expected and where to obtain it

## Key Reminders

- **GET requests only** - Do not generate POST, PUT, DELETE, or PATCH commands
- **Placeholders are mandatory** - Never hardcode actual API keys or sensitive values
- **Plain English first** - Always explain technical concepts in accessible language
- **Fetch before asking** - Try to read documentation automatically before requesting copy/paste
`;

/**
 * Quest Builder System Prompt
 * Used when admins are creating quests via conversation
 * Generates MCP-compatible connector definitions
 */
export const QUEST_BUILDER_SYSTEM_PROMPT = `
You are a Quest Builder assistant for a Discord community bot. You help server administrators and moderators create quests that community members can complete to earn XP.

## Your Role

Guide admins through creating quests by:
1. Understanding what action they want users to complete
2. Reading API documentation to build verification connectors
3. Generating an MCP-compatible connector definition with validation rules
4. Confirming details before saving

## Quest Creation Flow

### Phase 1: Quest Details
Gather the following from the admin:
- **Quest name** (max 100 characters)
- **Description** (clear instructions for users, max 1000 characters)
- **XP reward** (1-10,000 XP)

### Phase 2: Verification Setup
Determine how to verify quest completion:
- **Verification type**: What identifier do users need to provide?
  - \`wallet_address\` - Blockchain wallet address → uses \`{{walletAddress}}\` placeholder
  - \`email\` - User's email address → uses \`{{emailAddress}}\` placeholder
  - \`twitter_handle\` - Twitter/X username → uses \`{{twitterHandle}}\` placeholder
  - \`discord_id\` - Discord user ID → uses \`{{discordId}}\` placeholder

- **API Key Environment Variable**: Ask what env var contains the API key (e.g., "OPENSEA_API_KEY")
  - The actual key is NEVER stored, only the variable name
  - Use \`{{apiKey}}\` placeholder in headers - the backend injects the real value

- **API Documentation**: Ask for the API documentation URL to understand the endpoint

### Phase 3: Build Connector Definition
${DOCUMENTATION_READER_SKILL}

After understanding the API, generate a **Connector Definition** in JSON format:

\`\`\`json
{
  "name": "Human-readable connector name",
  "description": "What this connector verifies",
  "endpoint": "https://api.example.com/v1/users/{{walletAddress}}/nfts",
  "method": "GET",
  "headers": {
    "Authorization": "Bearer {{apiKey}}",
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
\`\`\`

### Validation Function DSL

The \`validationFn\` MUST be a pure JSON object using this DSL:

**Supported Operations:**
- \`count\` - Count items in an array, compare to threshold
- \`sum\` - Sum numeric values in an array, compare to threshold
- \`compare\` - Compare a single value to a threshold
- \`exists\` - Check if a field exists

**Comparison Operators:** \`=\`, \`!=\`, \`>\`, \`>=\`, \`<\`, \`<=\`

**Path Rules:**
- Use dot notation: \`data.user.balance\`
- NO array indices: \`items[0]\` is FORBIDDEN
- NO wildcards: \`items.*\` is FORBIDDEN
- Must start with a letter or number

**Examples:**

Count items in array:
\`\`\`json
{ "op": "count", "path": "nfts", "compare": ">", "value": 0 }
\`\`\`

Compare single value:
\`\`\`json
{ "op": "compare", "path": "data.balance", "compare": ">=", "value": 100 }
\`\`\`

Sum values:
\`\`\`json
{ "op": "sum", "path": "transactions.amount", "compare": ">=", "value": 1.0 }
\`\`\`

Check field exists:
\`\`\`json
{ "op": "exists", "path": "data.user.verified" }
\`\`\`

With filter (where clause):
\`\`\`json
{
  "op": "count",
  "path": "items",
  "where": { "status": "completed" },
  "compare": ">",
  "value": 0
}
\`\`\`

### Phase 4: Confirm and Save

Present the complete quest configuration:
\`\`\`
QUEST CONFIGURATION:
━━━━━━━━━━━━━━━━━━━━
Name: [quest name]
Description: [description]
XP Reward: [amount] XP
Verification Type: [type]
API Key Env Var: [env var name]

CONNECTOR DEFINITION:
━━━━━━━━━━━━━━━━━━━━
[JSON connector definition]

USER INSTRUCTIONS:
━━━━━━━━━━━━━━━━━━━━
Users will run: /confirm identifier:[their ${'{'}verification_type${'}'}]
Validation: [natural language explanation]
\`\`\`

Ask: "Should I create this quest?"

When the admin confirms, output the final connector JSON inside a code block marked with \`\`\`connector so it can be parsed.

## Important Guidelines

- Be conversational and helpful
- Explain technical concepts in plain English
- If API docs are unclear, ask clarifying questions
- Never store actual API keys in quest data - only the endpoint structure
- Validate that the API endpoint is accessible before confirming
- Keep the conversation focused on one quest at a time
`;

/**
 * Quest Assignment Message Template
 * Used when a user runs /quest
 */
export const QUEST_ASSIGNMENT_TEMPLATE = (quest: {
  name: string;
  description: string;
  xpReward: number;
  verificationType: string;
}) => `
🎯 **Quest Assigned: ${quest.name}**

📋 **Description:**
${quest.description}

🏆 **Reward:** ${quest.xpReward} XP

📝 **How to Complete:**
1. Complete the quest action described above
2. Run \`/confirm\` with your ${formatVerificationType(quest.verificationType)}
3. We'll verify your completion and award your XP!

Good luck, adventurer!
`;

/**
 * Quest Completion Success Template
 */
export const QUEST_COMPLETION_SUCCESS_TEMPLATE = (data: {
  questName: string;
  xpEarned: number;
  totalXp: number;
}) => `
✅ **Quest Complete: ${data.questName}**

🎉 Congratulations! Your completion has been verified.

💰 **XP Earned:** +${data.xpEarned} XP
📊 **Total XP:** ${data.totalXp.toLocaleString()} XP

Run \`/quest\` to get your next adventure!
`;

/**
 * Quest Completion Failure Template
 */
export const QUEST_COMPLETION_FAILURE_TEMPLATE = (data: {
  questName: string;
  verificationType: string;
  reason?: string;
}) => `
❌ **Verification Failed**

We couldn't verify your quest completion for "${data.questName}".

${data.reason ? `**Reason:** ${data.reason}\n` : ''}
**Possible issues:**
• The action hasn't been completed yet
• The ${formatVerificationType(data.verificationType)} provided doesn't match our records
• There may be a delay in the verification system

Please ensure you've completed the quest and try again later.
Need help? Contact a moderator.
`;

/**
 * XP Progress Template
 * Used when a user runs /xp
 */
export const XP_PROGRESS_TEMPLATE = (data: {
  totalXp: number;
  completedQuests: Array<{ name: string; xp: number; completedAt: Date }>;
  currentQuest?: { name: string; xp: number; assignedAt: Date };
}) => {
  const completedList = data.completedQuests.length > 0
    ? data.completedQuests
        .slice(0, 10) // Show last 10
        .map((q, i, arr) => {
          const prefix = i === arr.length - 1 ? '└─' : '├─';
          const date = q.completedAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
          return `${prefix} ${q.name} (+${q.xp} XP) - ${date}`;
        })
        .join('\n')
    : '└─ No quests completed yet';

  const currentQuestSection = data.currentQuest
    ? `\n🎯 **Current Quest:**\n└─ ${data.currentQuest.name} (${data.currentQuest.xp} XP) - Assigned ${data.currentQuest.assignedAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
    : '\n💡 Run `/quest` to get a new quest!';

  return `
📊 **Your Quest Progress**

⭐ **Total XP:** ${data.totalXp.toLocaleString()}

🏆 **Completed Quests (${data.completedQuests.length}):**
${completedList}
${currentQuestSection}

Keep questing to climb the leaderboard!
`;
};

/**
 * No Quests Available Template
 */
export const NO_QUESTS_AVAILABLE_TEMPLATE = `
🔍 **No Quests Available**

There are no quests available right now. Check back later or ask a moderator to create some quests!
`;

/**
 * Already Has Active Quest Template
 */
export const ACTIVE_QUEST_EXISTS_TEMPLATE = (quest: {
  name: string;
  description: string;
  xpReward: number;
  verificationType: string;
  assignedAt: Date;
}) => `
📌 **You Already Have an Active Quest**

You were assigned this quest on ${quest.assignedAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}:

🎯 **${quest.name}**

📋 **Description:**
${quest.description}

🏆 **Reward:** ${quest.xpReward} XP

Complete this quest first by running \`/confirm\` with your ${formatVerificationType(quest.verificationType)}, or contact a moderator if you need help.
`;

/**
 * All Quests Completed Template
 */
export const ALL_QUESTS_COMPLETED_TEMPLATE = (totalXp: number, questCount: number) => `
🏆 **Congratulations, Champion!**

You've completed all ${questCount} available quests and earned ${totalXp.toLocaleString()} XP!

Check back later for new quests, or ask the moderators when more will be available.
`;

/**
 * Helper function to format verification type for display
 */
function formatVerificationType(type: string): string {
  const typeMap: Record<string, string> = {
    email: 'email address',
    wallet_address: 'wallet address',
    discord_id: 'Discord ID',
    twitter_handle: 'Twitter/X handle',
  };
  return typeMap[type] || type;
}

/**
 * Rate limit exceeded template
 */
export const RATE_LIMIT_TEMPLATE = (command: string, retryAfter: number) => `
⏳ **Slow Down!**

You've used \`/${command}\` too many times recently. Please wait ${Math.ceil(retryAfter / 60)} minute(s) before trying again.
`;

/**
 * Permission denied template for quest creation
 */
export const QUEST_CREATION_PERMISSION_DENIED = `
🚫 **Permission Denied**

Only server administrators and moderators can create quests. If you believe you should have access, please contact a server admin.
`;
