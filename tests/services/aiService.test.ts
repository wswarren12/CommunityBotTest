import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import Anthropic from '@anthropic-ai/sdk';
import { generateSummary, detectEvents, testConnection } from '../../src/services/aiService';
import { MessageWithUser } from '../../src/types/database';
import * as logger from '../../src/utils/logger';

// Mock dependencies
jest.mock('@anthropic-ai/sdk');
jest.mock('../../src/utils/logger');

describe('aiService', () => {
  let mockAnthropicInstance: any;
  let mockCreate: any;

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup mock for Anthropic SDK
    mockCreate = jest.fn();
    mockAnthropicInstance = {
      messages: {
        create: mockCreate,
      },
    };

    (Anthropic as any).mockImplementation(() => mockAnthropicInstance);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('generateSummary', () => {
    const mockMessages: MessageWithUser[] = [
      {
        message_id: 'msg1',
        channel_id: 'channel1',
        user_id: 'user1',
        guild_id: 'guild1',
        content: 'Hello everyone!',
        posted_at: new Date('2026-01-10T10:00:00Z'),
        has_mentions: false,
        mention_users: [],
        mention_roles: [],
        has_attachments: false,
        attachment_count: 0,
        created_at: new Date(),
        author_name: 'TestUser',
        author_global_name: undefined,
        channel_name: 'general',
      },
      {
        message_id: 'msg2',
        channel_id: 'channel1',
        user_id: 'user2',
        guild_id: 'guild1',
        content: '@TestUser check this out!',
        posted_at: new Date('2026-01-10T10:05:00Z'),
        has_mentions: true,
        mention_users: ['user1'],
        mention_roles: [],
        has_attachments: false,
        attachment_count: 0,
        created_at: new Date(),
        author_name: 'OtherUser',
        author_global_name: undefined,
        channel_name: 'general',
      },
    ];

    const mockRequest = {
      userId: 'user1',
      username: 'TestUser',
      guildId: 'guild1',
      guildName: 'Test Guild',
      sinceTimestamp: new Date('2026-01-10T09:00:00Z'),
      messages: mockMessages,
      userRoles: ['Member', 'Contributor'],
      mentionCount: 1,
    };

    it('should generate a brief summary successfully', async () => {
      const mockResponse = {
        content: [
          {
            type: 'text',
            text: '🎯 **Important for You**\n- You were mentioned in #general\n\n💬 **Active Discussions**\n- General conversation ongoing',
          },
        ],
      };

      mockCreate.mockResolvedValue(mockResponse);

      const result = await generateSummary(mockRequest, 'brief');

      expect(result).toEqual({
        summary: expect.stringContaining('Important for You'),
        messageCount: 2,
        mentionCount: 1,
        categories: {
          mentions: 1,
          discussions: 0,
          announcements: 0,
          events: 0,
        },
      });

      expect(mockCreate).toHaveBeenCalledWith({
        model: expect.any(String),
        max_tokens: expect.any(Number),
        messages: [
          {
            role: 'user',
            content: expect.stringContaining('TestUser'),
          },
        ],
      });

      expect(logger.logger.info).toHaveBeenCalledWith(
        'Summary generated successfully',
        expect.objectContaining({
          userId: 'user1',
          messageCount: 2,
        })
      );
    });

    it('should generate a detailed summary successfully', async () => {
      const mockResponse = {
        content: [
          {
            type: 'text',
            text: '🎯 **Important for You**\n- Detailed mention info\n\n💬 **Active Discussions**\n- More detailed discussion info\n\n📢 **Announcements**\n- Some announcement',
          },
        ],
      };

      mockCreate.mockResolvedValue(mockResponse);

      const result = await generateSummary(mockRequest, 'detailed');

      expect(result.summary).toContain('Important for You');
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: [
            {
              role: 'user',
              content: expect.stringContaining('10-15 bullet points'),
            },
          ],
        })
      );
    });

    it('should generate a full summary successfully', async () => {
      const mockResponse = {
        content: [
          {
            type: 'text',
            text: '🎯 **Important for You**\n- Very detailed mention with quote\n\n💬 **Active Discussions**\n- Comprehensive discussion details with context',
          },
        ],
      };

      mockCreate.mockResolvedValue(mockResponse);

      const result = await generateSummary(mockRequest, 'full');

      expect(result.summary).toBeTruthy();
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: [
            {
              role: 'user',
              content: expect.stringContaining('comprehensive details'),
            },
          ],
        })
      );
    });

    it('should count categories correctly based on emojis', async () => {
      const mockResponse = {
        content: [
          {
            type: 'text',
            text: '💬💬💬 Discussion\n📢📢 Announcements\n📅 Event',
          },
        ],
      };

      mockCreate.mockResolvedValue(mockResponse);

      const result = await generateSummary(mockRequest, 'brief');

      expect(result.categories.discussions).toBe(3);
      expect(result.categories.announcements).toBe(2);
      expect(result.categories.events).toBe(1);
    });

    it('should handle empty messages array', async () => {
      const mockResponse = {
        content: [
          {
            type: 'text',
            text: 'All caught up! No new messages.',
          },
        ],
      };

      mockCreate.mockResolvedValue(mockResponse);

      const emptyRequest = {
        ...mockRequest,
        messages: [],
      };

      const result = await generateSummary(emptyRequest, 'brief');

      expect(result.messageCount).toBe(0);
      expect(result.summary).toBeTruthy();
    });

    it('should throw error when API call fails', async () => {
      mockCreate.mockRejectedValue(new Error('API rate limit exceeded'));

      await expect(generateSummary(mockRequest, 'brief')).rejects.toThrow(
        'Failed to generate summary with AI'
      );

      expect(logger.logger.error).toHaveBeenCalledWith(
        'Failed to generate summary',
        expect.objectContaining({
          userId: 'user1',
          error: 'API rate limit exceeded',
        })
      );
    });

    it('should throw error when response has no text content', async () => {
      const mockResponse = {
        content: [
          {
            type: 'image',
            source: { type: 'base64', data: 'somedata' },
          },
        ],
      };

      mockCreate.mockResolvedValue(mockResponse);

      await expect(generateSummary(mockRequest, 'brief')).rejects.toThrow(
        'No text content in Claude response'
      );
    });

    it('should include Discord message links in prompt', async () => {
      const mockResponse = {
        content: [{ type: 'text', text: 'Summary' }],
      };

      mockCreate.mockResolvedValue(mockResponse);

      await generateSummary(mockRequest, 'brief');

      const promptCall = mockCreate.mock.calls[0][0];
      expect(promptCall.messages[0].content).toContain(
        `https://discord.com/channels/${mockRequest.guildId}`
      );
    });

    it('should include user roles in prompt', async () => {
      const mockResponse = {
        content: [{ type: 'text', text: 'Summary' }],
      };

      mockCreate.mockResolvedValue(mockResponse);

      await generateSummary(mockRequest, 'brief');

      const promptCall = mockCreate.mock.calls[0][0];
      expect(promptCall.messages[0].content).toContain('Member, Contributor');
    });

    it('should truncate long message content to 500 chars', async () => {
      const longMessage: MessageWithUser = {
        ...mockMessages[0],
        content: 'a'.repeat(600),
      };

      const requestWithLongMessage = {
        ...mockRequest,
        messages: [longMessage],
      };

      const mockResponse = {
        content: [{ type: 'text', text: 'Summary' }],
      };

      mockCreate.mockResolvedValue(mockResponse);

      await generateSummary(requestWithLongMessage, 'brief');

      const promptCall = mockCreate.mock.calls[0][0];
      expect(promptCall.messages[0].content).toContain('a'.repeat(500));
      expect(promptCall.messages[0].content).not.toContain('a'.repeat(501));
    });
  });

  describe('detectEvents', () => {
    const mockMessages: MessageWithUser[] = [
      {
        message_id: 'msg1',
        channel_id: 'channel1',
        user_id: 'user1',
        guild_id: 'guild1',
        content: 'Hey everyone, we should have a gaming session on Friday at 7pm!',
        posted_at: new Date('2026-01-10T10:00:00Z'),
        has_mentions: false,
        mention_users: [],
        mention_roles: [],
        has_attachments: false,
        attachment_count: 0,
        created_at: new Date(),
        author_name: 'TestUser',
        author_global_name: undefined,
        channel_name: 'general',
      },
    ];

    const mockRequest = {
      messages: mockMessages,
      serverTimezone: 'America/New_York',
      currentDate: new Date('2026-01-10T12:00:00Z'),
    };

    it('should detect events successfully', async () => {
      const mockEventsResponse = JSON.stringify([
        {
          id: 'evt_123',
          title: 'Gaming Session',
          description: 'Community gaming night',
          datetime: '2026-01-17T00:00:00Z',
          channel: 'general',
          organizerId: 'user1',
          organizerName: 'TestUser',
          type: 'gaming',
          participants: [],
          sourceMessageId: 'msg1',
          confidence: 85,
        },
      ]);

      const mockResponse = {
        content: [
          {
            type: 'text',
            text: mockEventsResponse,
          },
        ],
      };

      mockCreate.mockResolvedValue(mockResponse);

      const result = await detectEvents(mockRequest);

      expect(result.events).toHaveLength(1);
      expect(result.events[0]).toMatchObject({
        id: 'evt_123',
        title: 'Gaming Session',
        type: 'gaming',
        confidence: 85,
      });

      expect(logger.logger.info).toHaveBeenCalledWith(
        'Events detected',
        expect.objectContaining({
          eventCount: 1,
          messageCount: 1,
        })
      );
    });

    it('should handle JSON in markdown code blocks', async () => {
      const mockEventsResponse = '```json\n[{"id": "evt_456", "title": "Meeting", "datetime": "2026-01-15T10:00:00Z", "organizerId": "user1", "organizerName": "Test", "type": "meeting", "participants": [], "sourceMessageId": "msg1", "confidence": 90}]\n```';

      const mockResponse = {
        content: [{ type: 'text', text: mockEventsResponse }],
      };

      mockCreate.mockResolvedValue(mockResponse);

      const result = await detectEvents(mockRequest);

      expect(result.events).toHaveLength(1);
      expect(result.events[0].title).toBe('Meeting');
    });

    it('should handle empty events array', async () => {
      const mockResponse = {
        content: [{ type: 'text', text: '[]' }],
      };

      mockCreate.mockResolvedValue(mockResponse);

      const result = await detectEvents(mockRequest);

      expect(result.events).toHaveLength(0);
    });

    it('should return empty array on API error', async () => {
      mockCreate.mockRejectedValue(new Error('API error'));

      const result = await detectEvents(mockRequest);

      expect(result.events).toHaveLength(0);
      expect(logger.logger.error).toHaveBeenCalledWith(
        'Failed to detect events',
        expect.objectContaining({
          error: 'API error',
        })
      );
    });

    it('should return empty array on JSON parse error', async () => {
      const mockResponse = {
        content: [{ type: 'text', text: 'Invalid JSON {{{' }],
      };

      mockCreate.mockResolvedValue(mockResponse);

      const result = await detectEvents(mockRequest);

      expect(result.events).toHaveLength(0);
      expect(logger.logger.error).toHaveBeenCalledWith(
        'Failed to parse event detection response',
        expect.objectContaining({
          error: expect.stringContaining('JSON'),
        })
      );
    });

    it('should handle non-array JSON response', async () => {
      const mockResponse = {
        content: [{ type: 'text', text: '{"single": "event"}' }],
      };

      mockCreate.mockResolvedValue(mockResponse);

      const result = await detectEvents(mockRequest);

      expect(result.events).toHaveLength(0);
    });

    it('should include server timezone in prompt', async () => {
      const mockResponse = {
        content: [{ type: 'text', text: '[]' }],
      };

      mockCreate.mockResolvedValue(mockResponse);

      await detectEvents(mockRequest);

      const promptCall = mockCreate.mock.calls[0][0];
      expect(promptCall.messages[0].content).toContain('America/New_York');
    });

    it('should include current date in prompt', async () => {
      const mockResponse = {
        content: [{ type: 'text', text: '[]' }],
      };

      mockCreate.mockResolvedValue(mockResponse);

      await detectEvents(mockRequest);

      const promptCall = mockCreate.mock.calls[0][0];
      expect(promptCall.messages[0].content).toContain('2026-01-10');
    });

    it('should include message content and metadata', async () => {
      const mockResponse = {
        content: [{ type: 'text', text: '[]' }],
      };

      mockCreate.mockResolvedValue(mockResponse);

      await detectEvents(mockRequest);

      const promptCall = mockCreate.mock.calls[0][0];
      expect(promptCall.messages[0].content).toContain('gaming session');
      expect(promptCall.messages[0].content).toContain('TestUser');
      expect(promptCall.messages[0].content).toContain('#general');
    });
  });

  describe('testConnection', () => {
    it('should return true on successful connection', async () => {
      const mockResponse = {
        content: [{ type: 'text', text: 'OK' }],
      };

      mockCreate.mockResolvedValue(mockResponse);

      const result = await testConnection();

      expect(result).toBe(true);
      expect(logger.logger.info).toHaveBeenCalledWith(
        'Claude API connection test successful',
        expect.objectContaining({ response: 'OK' })
      );
    });

    it('should return false on connection failure', async () => {
      mockCreate.mockRejectedValue(new Error('Network error'));

      const result = await testConnection();

      expect(result).toBe(false);
      expect(logger.logger.error).toHaveBeenCalledWith(
        'Claude API connection test failed',
        expect.objectContaining({ error: 'Network error' })
      );
    });

    it('should use minimal tokens for test', async () => {
      const mockResponse = {
        content: [{ type: 'text', text: 'OK' }],
      };

      mockCreate.mockResolvedValue(mockResponse);

      await testConnection();

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          max_tokens: 50,
        })
      );
    });
  });
});
