# Event Detector Subagent

## Purpose
Detect and extract event information from Discord messages using natural language processing. This subagent identifies when users mention upcoming events, meetings, game sessions, or community activities that aren't formally posted as Discord events.

## Context
- Discord has native scheduled events, but users often mention events in casual conversation
- Event information may be scattered across multiple messages
- Dates and times may be in various formats (relative, absolute, informal)
- Users may reference timezones implicitly based on server defaults
- Events should be surfaced in catchup summaries to prevent users from missing them

## Responsibilities
- Scan messages for event-related keywords and patterns
- Extract structured event data (title, date, time, location/channel)
- Normalize date/time formats
- Identify recurring events
- Distinguish actual events from hypothetical discussions
- Calculate relevance scores based on user roles and participation

## Guidelines

1. **Event Indicators**:
   - Keywords: "meeting", "game night", "stream", "watch party", "tournament", "session", "gathering"
   - Time expressions: "tomorrow", "next week", "Friday at 7pm", "in 2 hours"
   - Planning phrases: "let's meet", "join us", "who's in", "RSVP"
   - Calendar dates: "Jan 15", "15/01", "2026-01-15"

2. **Confidence Levels**:
   - **High (80-100%)**: Clear date/time, explicit event type, location specified
   - **Medium (50-79%)**: Date mentioned, event type clear, some details missing
   - **Low (20-49%)**: Vague timing, uncertain commitment, hypothetical discussion
   - **Ignore (<20%)**: Past events, purely speculative, no actionable details

3. **Event Attributes**:
   - **Title**: Brief description (max 100 chars)
   - **Date/Time**: ISO 8601 format with timezone
   - **Channel**: Where event occurs (channel mention or "TBD")
   - **Organizer**: User who mentioned/proposed it
   - **Type**: meeting, gaming, stream, social, tournament, other
   - **Participants**: Mentioned users or role tags

4. **Disambiguation**:
   - "Tomorrow at 3pm" requires current date context
   - "Friday" means next Friday if today is not Friday, this Friday if mentioned early in the week
   - Timezone defaults to server's primary timezone unless specified

## Input Format

```typescript
interface EventDetectionRequest {
  messages: Array<{
    id: string;
    authorId: string;
    authorName: string;
    channelId: string;
    channelName: string;
    content: string;
    timestamp: Date;
    mentions: string[];
  }>;
  serverTimezone: string; // e.g., "America/New_York"
  currentDate: Date;
}
```

## Output Format

```typescript
interface EventDetectionResponse {
  events: Array<{
    id: string; // Generated hash of event details
    title: string;
    description?: string;
    datetime: Date; // ISO 8601
    endDatetime?: Date;
    channel?: string;
    organizer: {
      userId: string;
      userName: string;
    };
    type: 'meeting' | 'gaming' | 'stream' | 'social' | 'tournament' | 'other';
    participants: string[]; // User IDs or role names
    sourceMessageId: string;
    sourceMessageLink: string;
    confidence: number; // 0-100
    recurring?: {
      frequency: 'daily' | 'weekly' | 'monthly';
      endDate?: Date;
    };
  }>;
}
```

## Examples

### Example 1: Clear Event Announcement
**Input:**
```
Message from @alice in #general at 2026-01-08 10:00 AM:
"Hey everyone! Game night this Friday at 8pm EST. We'll be in the voice channel playing Among Us. Who's in? @gamers"
```

**Expected Output:**
```typescript
{
  events: [{
    id: "evt_abc123",
    title: "Game Night - Among Us",
    description: "Playing Among Us in voice channel",
    datetime: "2026-01-10T20:00:00-05:00", // Friday 8pm EST
    channel: "voice channel",
    organizer: { userId: "alice_id", userName: "alice" },
    type: "gaming",
    participants: ["@gamers"],
    sourceMessageId: "msg_xyz",
    sourceMessageLink: "https://discord.com/channels/...",
    confidence: 95
  }]
}
```

### Example 2: Vague Event Discussion
**Input:**
```
Message from @bob in #general at 2026-01-08 10:00 AM:
"We should probably have a team meeting sometime next week to discuss the project"
```

**Expected Output:**
```typescript
{
  events: [{
    id: "evt_def456",
    title: "Team meeting - project discussion",
    description: "Discuss the project",
    datetime: "2026-01-13T00:00:00-05:00", // Monday next week (default)
    organizer: { userId: "bob_id", userName: "bob" },
    type: "meeting",
    participants: [],
    sourceMessageId: "msg_abc",
    sourceMessageLink: "https://discord.com/channels/...",
    confidence: 45 // Low confidence - vague timing
  }]
}
```

### Example 3: Recurring Event
**Input:**
```
Message from @carol in #announcements at 2026-01-08 10:00 AM:
"Starting next Monday, we'll have weekly dev standups every Monday at 10am in #dev-chat"
```

**Expected Output:**
```typescript
{
  events: [{
    id: "evt_ghi789",
    title: "Weekly Dev Standup",
    datetime: "2026-01-13T10:00:00-05:00", // Next Monday
    channel: "#dev-chat",
    organizer: { userId: "carol_id", userName: "carol" },
    type: "meeting",
    participants: [],
    sourceMessageId: "msg_def",
    sourceMessageLink: "https://discord.com/channels/...",
    confidence: 90,
    recurring: {
      frequency: "weekly"
    }
  }]
}
```

### Example 4: Multi-Message Event Planning
**Input:**
```
Message 1 from @dave in #general at 2026-01-08 10:00 AM:
"Anyone want to do a movie watch party?"

Message 2 from @eve in #general at 2026-01-08 10:05 AM:
"Yes! How about Saturday?"

Message 3 from @dave in #general at 2026-01-08 10:06 AM:
"Perfect! Saturday at 7pm, I'll stream in #watch-party"
```

**Expected Output:**
```typescript
{
  events: [{
    id: "evt_jkl012",
    title: "Movie Watch Party",
    datetime: "2026-01-11T19:00:00-05:00", // Saturday 7pm
    channel: "#watch-party",
    organizer: { userId: "dave_id", userName: "dave" },
    type: "social",
    participants: ["eve_id"],
    sourceMessageId: "msg_ghi", // Last message with concrete details
    sourceMessageLink: "https://discord.com/channels/...",
    confidence: 85
  }]
}
```

## Edge Cases

### Past Event Mentioned
If an event is clearly in the past (based on timestamp), ignore it unless it's referencing a recurring series.

### Hypothetical Events
Messages like "maybe we could..." or "it would be cool if..." should have very low confidence (<30%) or be ignored.

### Timezone Ambiguity
If timezone isn't specified, use server default. If multiple timezones are common in the server, flag with medium confidence.

### Conflicting Information
If multiple messages about the same event have conflicting times, use the most recent message and note the conflict in description.

### Event Cancellation
Messages like "Game night is cancelled" should be detected and paired with the original event to mark as cancelled.

## Integration Points

- **Files**:
  - `src/services/eventService.ts` - Event detection and management
  - `src/services/aiService.ts` - Claude API for NLP
  - `src/db/events.ts` - Event storage and retrieval

- **Functions**:
  - `detectEvents(request: EventDetectionRequest): Promise<EventDetectionResponse>`
  - `mergeDiscordEvents(detectedEvents, nativeEvents): Promise<Event[]>`

- **APIs**:
  - Anthropic Claude API (for NLP event extraction)
  - Discord API (for native scheduled events)

## Testing Considerations

### Test Cases
1. Clear single-message event with all details
2. Multi-message event planning conversation
3. Vague event discussion ("sometime next week")
4. Recurring event announcement
5. Event with relative time ("in 2 hours", "tomorrow")
6. Event with multiple timezone mentions
7. Event cancellation or rescheduling
8. Hypothetical event discussion (should not detect)
9. Past event reference (should ignore)
10. Event with @role mention for participants

### Validation
- Date parsing accuracy across formats
- Timezone conversion correctness
- Confidence scoring consistency
- Duplicate event detection
- Message link validity

### Known Limitations
- Cannot detect events from images or voice chat
- May struggle with very casual/slang expressions
- Relies on Claude API for complex NLP
- Time expressions in non-English may fail
- Cannot access calendar availability for conflict detection

## Notes for AI Assistants

- **Context Matters**: Read surrounding messages for complete event details
- **Conservative Confidence**: When in doubt, score lower rather than higher
- **Timezone Defaults**: Always include timezone in datetime output
- **Deduplication**: Check if similar event already exists before creating new entry
- **User Relevance**: Consider if event is relevant to user's roles when surfacing in summaries
- **Native Events**: Prefer Discord's native scheduled events over detected ones
- **Update Handling**: If event details change in follow-up messages, update existing event
- **Privacy**: Never detect events from channels user cannot access

## Prompt Template for Claude API

```
You are analyzing Discord messages to detect upcoming events and gatherings.

Server Context:
- Server timezone: {serverTimezone}
- Current date/time: {currentDate}

Messages to analyze:
{messages}

Extract structured event information including:
1. Event title and description
2. Date and time (convert to ISO 8601 with timezone)
3. Location (channel or other)
4. Organizer and participants
5. Event type (meeting, gaming, stream, social, tournament, other)
6. Confidence level (0-100)

Rules:
- Ignore past events unless part of recurring series
- Ignore purely hypothetical discussions ("maybe", "we should")
- Use server timezone if not specified
- Combine information from multiple messages about the same event
- For vague times ("next week"), use reasonable defaults (Monday)
- Detect cancellations and reschedules

Return JSON array of detected events with all fields populated.
```

## Example Integration with Summary

When an event is detected with confidence > 70%, include in catchup summary:

```markdown
📅 Upcoming Events
- **Game Night - Among Us** • Friday, Jan 10 at 8:00 PM
  Organized by @alice in voice channel ([details](link))

- **Weekly Dev Standup** • Every Monday at 10:00 AM
  In #dev-chat ([details](link))
```
