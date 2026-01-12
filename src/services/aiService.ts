import Anthropic from '@anthropic-ai/sdk';
import { logger } from '../utils/logger';
import { MessageWithUser, EventType } from '../types/database';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const CLAUDE_MODEL = process.env.CLAUDE_MODEL || 'claude-3-5-sonnet-20241022';
const MAX_TOKENS = parseInt(process.env.MAX_SUMMARY_TOKENS || '1500', 10);

export interface SummaryRequest {
  userId: string;
  username: string;
  guildId: string;
  guildName: string;
  sinceTimestamp: Date;
  messages: MessageWithUser[];
  userRoles: string[];
  mentionCount: number;
}

export interface SummaryResponse {
  summary: string;
  messageCount: number;
  mentionCount: number;
  categories: {
    mentions: number;
    discussions: number;
    announcements: number;
    events: number;
  };
}

export interface EventDetectionRequest {
  messages: MessageWithUser[];
  serverTimezone: string;
  currentDate: Date;
}

export interface DetectedEvent {
  id: string;
  title: string;
  description?: string;
  datetime: Date;
  endDatetime?: Date;
  channel?: string;
  organizerId: string;
  organizerName: string;
  type: EventType;
  participants: string[];
  sourceMessageId: string;
  confidence: number;
  recurring?: {
    frequency: 'daily' | 'weekly' | 'monthly';
    endDate?: Date;
  };
}

export interface EventDetectionResponse {
  events: DetectedEvent[];
}

/**
 * Generate a personalized summary using Claude
 */
export async function generateSummary(
  request: SummaryRequest,
  detailLevel: 'brief' | 'detailed' | 'full' = 'brief'
): Promise<SummaryResponse> {
  try {
    const prompt = buildSummaryPrompt(request, detailLevel);

    logger.debug('Generating summary with Claude', {
      userId: request.userId,
      messageCount: request.messages.length,
      detailLevel,
    });

    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: MAX_TOKENS,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    });

    const summaryText = extractTextFromResponse(response);

    // Count categories (simple heuristic based on content)
    const categories = {
      mentions: request.mentionCount,
      discussions: countOccurrences(summaryText, '💬'),
      announcements: countOccurrences(summaryText, '📢'),
      events: countOccurrences(summaryText, '📅'),
    };

    logger.info('Summary generated successfully', {
      userId: request.userId,
      messageCount: request.messages.length,
      summaryLength: summaryText.length,
    });

    return {
      summary: summaryText,
      messageCount: request.messages.length,
      mentionCount: request.mentionCount,
      categories,
    };
  } catch (error) {
    logger.error('Failed to generate summary', {
      userId: request.userId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw new Error('Failed to generate summary with AI');
  }
}

/**
 * Detect events from messages using Claude
 */
export async function detectEvents(
  request: EventDetectionRequest
): Promise<EventDetectionResponse> {
  try {
    const prompt = buildEventDetectionPrompt(request);

    logger.debug('Detecting events with Claude', {
      messageCount: request.messages.length,
    });

    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 2000,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    });

    const responseText = extractTextFromResponse(response);
    const events = parseEventDetectionResponse(responseText);

    logger.info('Events detected', {
      eventCount: events.length,
      messageCount: request.messages.length,
    });

    return { events };
  } catch (error) {
    logger.error('Failed to detect events', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return { events: [] }; // Return empty array on error
  }
}

/**
 * Build the prompt for summary generation
 */
function buildSummaryPrompt(
  request: SummaryRequest,
  detailLevel: 'brief' | 'detailed' | 'full'
): string {
  const { username, sinceTimestamp, messages, userRoles, mentionCount, guildName } = request;

  const messagesText = messages
    .map(
      (msg) =>
        `[${msg.posted_at.toISOString()}] #${msg.channel_name} - ${msg.author_name}: ${msg.content.substring(0, 500)}`
    )
    .join('\n');

  const detailInstructions = {
    brief: 'Maximum 5-7 main bullet points. Be very concise.',
    detailed: 'Provide 10-15 bullet points with more context and details.',
    full: 'Provide comprehensive details with quotes and full context.',
  };

  return `You are a Discord community assistant helping ${username} catch up on missed activity in ${guildName}.

User Context:
- Username: ${username}
- Roles: ${userRoles.join(', ') || 'None'}
- Last active: ${sinceTimestamp.toLocaleString()}
- Mentioned ${mentionCount} times

Messages to summarize (${messages.length} total):
${messagesText}

Generate a personalized summary following this structure:
1. 🎯 Important for You (mentions, replies to user)
2. 💬 Active Discussions (high-engagement threads)
3. 📢 Announcements (server updates, events)
4. 🔥 Trending Topics (popular discussions)

Rules:
- ${detailInstructions[detailLevel]}
- Include Discord message links: https://discord.com/channels/${request.guildId}/{channelId}/{messageId}
- Prioritize user-relevant information
- Use emojis for visual structure (sparingly)
- Be friendly and conversational but concise
- Format in markdown

If there are very few messages (< 5), keep it brief and friendly.`;
}

/**
 * Build the prompt for event detection
 */
function buildEventDetectionPrompt(request: EventDetectionRequest): string {
  const { messages, serverTimezone, currentDate } = request;

  const messagesText = messages
    .map(
      (msg) =>
        `[${msg.message_id}] ${msg.author_name} in #${msg.channel_name} at ${msg.posted_at.toISOString()}: ${msg.content}`
    )
    .join('\n\n');

  return `You are analyzing Discord messages to detect upcoming events and gatherings.

Server Context:
- Server timezone: ${serverTimezone}
- Current date/time: ${currentDate.toISOString()}

Messages to analyze:
${messagesText}

Extract structured event information. Return JSON array with this format:
[{
  "id": "unique_id",
  "title": "Event title",
  "description": "Event description",
  "datetime": "ISO 8601 datetime with timezone",
  "endDatetime": "ISO 8601 datetime with timezone (optional)",
  "channel": "channel name or location",
  "organizerId": "user ID",
  "organizerName": "user name",
  "type": "meeting|gaming|stream|social|tournament|other",
  "participants": ["mentioned user IDs or role names"],
  "sourceMessageId": "message ID",
  "confidence": 0-100,
  "recurring": { "frequency": "daily|weekly|monthly", "endDate": "ISO 8601" } (optional)
}]

Rules:
- Ignore past events unless part of recurring series
- Ignore purely hypothetical discussions ("maybe", "we should")
- Use server timezone if not specified
- For vague times ("next week"), use reasonable defaults (Monday)
- Combine information from multiple messages about the same event
- Only include events with confidence > 50

Return ONLY the JSON array, no other text.`;
}

/**
 * Extract text content from Claude response
 */
function extractTextFromResponse(response: Anthropic.Message): string {
  const textContent = response.content.find((block) => block.type === 'text');
  if (!textContent || textContent.type !== 'text') {
    throw new Error('No text content in Claude response');
  }
  return textContent.text;
}

/**
 * Parse event detection response from JSON
 */
function parseEventDetectionResponse(responseText: string): DetectedEvent[] {
  try {
    // Extract JSON from markdown code blocks if present
    const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    const jsonText = jsonMatch ? jsonMatch[1] : responseText;

    const parsed = JSON.parse(jsonText);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    logger.error('Failed to parse event detection response', {
      error: error instanceof Error ? error.message : 'Unknown error',
      responseText: responseText.substring(0, 500),
    });
    return [];
  }
}

/**
 * Count occurrences of a substring
 */
function countOccurrences(text: string, substring: string): number {
  return (text.match(new RegExp(substring, 'g')) || []).length;
}

/**
 * Test Claude API connection
 */
export async function testConnection(): Promise<boolean> {
  try {
    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 50,
      messages: [
        {
          role: 'user',
          content: 'Say "OK" if you can read this.',
        },
      ],
    });

    const text = extractTextFromResponse(response);
    logger.info('Claude API connection test successful', { response: text });
    return true;
  } catch (error) {
    logger.error('Claude API connection test failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return false;
  }
}
