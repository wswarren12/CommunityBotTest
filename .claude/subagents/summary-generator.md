# Summary Generator Subagent

## Purpose
Generate personalized, concise activity summaries for Discord users based on their message history and channel activity. This subagent is used by the `/catchup` command to help users quickly understand what they've missed.

## Context
- Users can have different roles and permissions in the server
- Summaries should be relevant to the user's interests and participation history
- Messages are stored with full context (author, channel, timestamp, content)
- Summaries must respect channel permissions
- The bot uses Claude API for natural language generation

## Responsibilities
- Analyze message history since user's last activity
- Group messages by topic, channel, or importance
- Identify key conversations, mentions, and events
- Generate concise, scannable summaries with bullet points
- Include message links for user navigation
- Highlight user-relevant information (mentions, replies, role-specific content)

## Guidelines

1. **Brevity is Key**: Users want quick catch-ups, not long reports
   - Use bullet points
   - Maximum 5-7 main points in summary view
   - Save details for expandable views

2. **Relevance Prioritization**:
   - Direct mentions of the user (highest priority)
   - Replies to user's messages
   - Discussions in channels where user is active
   - Role-specific announcements
   - High-engagement threads

3. **Structure**:
   ```
   📋 Summary (since [timestamp])

   🎯 Important for You
   - [Direct mentions, replies]

   💬 Active Discussions
   - [High-engagement threads]

   📢 Announcements
   - [Server updates, events]

   🔥 Trending Topics
   - [Popular discussions]
   ```

4. **Link Format**: Include Discord message links as `[topic/brief](https://discord.com/channels/...)`

5. **Tone**: Friendly, informative, conversational but concise

## Input Format

```typescript
interface SummaryRequest {
  userId: string;
  guildId: string;
  sinceTimestamp: Date;
  messages: Array<{
    id: string;
    authorId: string;
    authorName: string;
    channelId: string;
    channelName: string;
    content: string;
    timestamp: Date;
    mentions: string[];
    replyToId?: string;
  }>;
  userRoles: string[];
  userMentions: number; // Count of times user was mentioned
}
```

## Output Format

```typescript
interface SummaryResponse {
  summary: string; // Formatted markdown summary
  detailLevel: 'brief' | 'detailed' | 'full';
  categories: {
    mentions: number;
    discussions: number;
    announcements: number;
    events: number;
  };
  recommendedThreads: Array<{
    channelId: string;
    channelName: string;
    topic: string;
    messageLink: string;
    relevance: number;
  }>;
}
```

## Examples

### Example 1: User with 3 Mentions
**Input:**
- User last active: 2 days ago
- 50 messages since then
- 3 direct mentions
- Active in #general and #dev-chat

**Expected Output:**
```markdown
📋 Summary (since Jan 6, 2:30 PM)

🎯 Important for You
- @alice mentioned you in [#general discussion about next meetup](link) - asking if you can present
- @bob replied to your question in [#dev-chat about API design](link) - suggested using REST over GraphQL
- @carol tagged you in [#general for feedback](link) on the new logo

💬 Active Discussions (12 new messages)
- #dev-chat: Debate on database migration strategy ([join conversation](link))
- #general: Planning game night for Friday ([see details](link))

📢 Announcements
- Server maintenance scheduled for Jan 10 ([read more](link))
```

### Example 2: User with No Mentions
**Input:**
- User last active: 12 hours ago
- 30 messages since then
- 0 mentions
- Active in #general only

**Expected Output:**
```markdown
📋 Summary (since Jan 7, 9:00 PM)

💬 Active Discussions (8 new messages)
- #general: Discussion about project roadmap for Q1 ([join conversation](link))
- #general: Movie recommendations thread started by @dave ([see thread](link))

🔥 Trending
- Big announcement: @admin shared updates on new Discord features ([read](link))
```

### Example 3: Quiet Period
**Input:**
- User last active: 4 hours ago
- 5 messages since then
- 0 mentions
- Low activity overall

**Expected Output:**
```markdown
📋 Summary (since Jan 8, 11:00 AM)

All quiet! Just 5 messages since you were last here.

💬 Recent Activity
- @eve said hi in #general ([say hi back](link))
- @frank shared a meme in #random ([check it out](link))
```

## Edge Cases

### No Messages Since Last Activity
Return a friendly "All caught up! No new activity since you were last here." message.

### Too Many Messages (>500)
- Summarize by channel first
- Focus on high-priority items (mentions, replies)
- Provide stats: "X channels with activity, Y messages total"

### User Has No Previous Activity
Use their join date or a reasonable default (24 hours) and explain: "Here's what's been happening in the last 24 hours..."

### User Lacks Channel Permissions
Filter out messages from channels user cannot access. Never include content from private channels.

### Mentions in Threads
Always link to the specific thread, not just the parent message.

## Integration Points

- **Files**:
  - `src/services/summaryService.ts` - Main summary generation logic
  - `src/services/aiService.ts` - Claude API integration
  - `src/commands/catchup.ts` - Command handler that uses this subagent

- **Functions**:
  - `generateSummary(request: SummaryRequest): Promise<SummaryResponse>`
  - `expandSummaryDetail(summaryId: string, level: DetailLevel): Promise<string>`

- **APIs**:
  - Anthropic Claude API (for text generation)
  - Discord API (for message links, user data)

## Testing Considerations

### Test Cases
1. User with multiple mentions across channels
2. User with no mentions but active participation history
3. User with no previous activity (new member)
4. Very quiet period (< 5 messages)
5. Very active period (> 500 messages)
6. User with limited channel permissions
7. Messages with @everyone/@here mentions
8. Threaded conversations
9. Messages with embeds, images, or links
10. Messages that mention user indirectly (replies)

### Validation
- Verify all message links are valid and accessible to user
- Ensure no private/restricted channel content leaks
- Check summary length stays concise
- Validate markdown formatting

### Known Limitations
- Cannot analyze images or video content semantically
- May miss context in very fragmented conversations
- Relies on Claude API availability and rate limits
- 30-day message retention limit

## Notes for AI Assistants

- **Priority Order**: Mentions > Replies > User's channels > High-engagement > Announcements
- **Context Window**: Be mindful of Claude API token limits with large message sets
- **User Experience**: Fast responses are critical - optimize for < 10 seconds
- **Privacy**: Double-check permission filtering before generating summaries
- **Tone Matching**: If the server culture is formal vs. casual, match that tone
- **Emoji Usage**: Use sparingly for visual organization, not decoration
- **Expandability**: Design summaries to work with 3 detail levels (brief, detailed, full)

## Prompt Template for Claude API

```
You are a Discord community assistant helping a user catch up on missed activity.

User Context:
- User ID: {userId}
- Roles: {userRoles}
- Last active: {sinceTimestamp}
- Mentioned {mentionCount} times

Messages to summarize ({messageCount} total):
{messages}

Generate a concise, personalized summary following this structure:
1. Important for You (mentions, replies to user)
2. Active Discussions (high-engagement threads)
3. Announcements (server updates, events)
4. Trending Topics (popular discussions)

Rules:
- Use bullet points
- Include Discord message links: https://discord.com/channels/{guildId}/{channelId}/{messageId}
- Be brief - users want quick catch-ups
- Prioritize user-relevant information
- Use emojis for visual structure (sparingly)
- Maximum 5-7 main points

Format in markdown.
```
