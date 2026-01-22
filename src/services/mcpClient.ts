/**
 * MCP Client Service
 * Handles communication with the Summon Quest Builder MCP via SSE
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { logger } from '../utils/logger';

// MCP Configuration from environment
const MCP_URL = process.env.MCP_URL || 'https://summon-ai-mcp-development.game7-workers.workers.dev/sse';
const MCP_TOKEN = process.env.MCP_TOKEN;

/**
 * Validation DSL types matching MCP specification
 */
export interface ValidationDSL {
  op: 'sum' | 'count' | 'compare' | 'exists';
  path: string;
  where?: WhereClause;
  compare?: '=' | '!=' | '>' | '>=' | '<' | '<=';
  value?: number | string | boolean;
}

export interface WhereClause {
  and?: Array<Record<string, unknown>>;
  or?: Array<Record<string, unknown>>;
  [key: string]: unknown;
}

/**
 * Connector definition for creating/updating connectors
 */
export interface ConnectorDefinition {
  name: string;
  description?: string;
  endpoint: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  headers: Record<string, string>;
  body: Record<string, unknown>;
  validationPrompt?: string;
  validationFn?: ValidationDSL;
}

/**
 * Parameters for testing a connector
 */
export interface TestConnectorParams {
  id: number;
  mode: 'fetch' | 'validate';
  variables?: Record<string, string>;
}

/**
 * Result from testing a connector
 */
export interface TestConnectorResult {
  endpoint: string;
  method: string;
  status: number;
  isValid?: boolean;
  data: unknown;
  error?: string;
}

/**
 * Result from creating a connector
 */
export interface CreateConnectorResult {
  id: number;
  name: string;
  success: boolean;
  error?: string;
}

/**
 * Tag definition for quests
 */
export interface QuestTag {
  name: string;
  color: string;
  tagTypeId: number;
}

/**
 * Task definition for creating/updating quest tasks
 */
export interface QuestTaskDefinition {
  id?: number;
  mcpConnectorId?: number;
  title: string;
  description?: string;
  imageUrl?: string;
  points?: number;
  seasonPoints?: number;
  maxCompletions?: number;
  maxCompletionsPerDay?: number;
}

/**
 * Quest dependency definition
 */
export interface QuestDependency {
  dependsOnQuestId: number;
}

/**
 * Quest status enum matching Summon MCP
 */
export type QuestStatus = 'LIVE' | 'DRAFT' | 'READY' | 'ARCHIVED' | 'SCHEDULED' | 'ENDED' | 'PAUSED';

/**
 * Quest definition for creating/updating quests
 */
export interface QuestDefinition {
  id?: number;
  campaignId?: number;
  title: string;
  description?: string;
  imageUrl?: string;
  appUrl?: string;
  points?: number;
  seasonPoints?: number;
  startAt?: string;
  endAt?: string;
  isFeatured?: boolean;
  isOnboarding?: boolean;
  tags?: QuestTag[];
  tasks?: QuestTaskDefinition[];
  questDependencies?: QuestDependency[];
}

/**
 * Result from creating/updating a quest
 */
export interface CreateQuestResult {
  id: number;
  title: string;
  success: boolean;
  error?: string;
}

/**
 * Quest list filter parameters
 */
export interface ListQuestsParams {
  title?: string;
  startDate?: string;
  endDate?: string;
  status?: QuestStatus;
  withCampaigns?: boolean;
  isFeatured?: boolean;
  isOnboarding?: boolean;
}

/**
 * Quest data returned from MCP
 */
export interface MCPQuest {
  id: number;
  title: string;
  description?: string;
  imageUrl?: string;
  appUrl?: string;
  points?: number;
  seasonPoints?: number;
  startAt?: string;
  endAt?: string;
  status: QuestStatus;
  isFeatured?: boolean;
  isOnboarding?: boolean;
  tasks?: MCPTask[];
  tags?: QuestTag[];
  questDependencies?: QuestDependency[];
}

/**
 * Task data returned from MCP
 */
export interface MCPTask {
  id: number;
  title: string;
  description?: string;
  imageUrl?: string;
  points?: number;
  seasonPoints?: number;
  maxCompletions?: number;
  maxCompletionsPerDay?: number;
  mcpConnectorId?: number;
}

/**
 * MCP Client for Quest Builder
 */
class MCPClient {
  private client: Client | null = null;
  private connected: boolean = false;
  private connectionPromise: Promise<void> | null = null;

  /**
   * Connect to the MCP server
   */
  async connect(): Promise<void> {
    if (this.connected && this.client) {
      return;
    }

    // Prevent multiple simultaneous connection attempts
    if (this.connectionPromise) {
      return this.connectionPromise;
    }

    this.connectionPromise = this._doConnect();
    try {
      await this.connectionPromise;
    } finally {
      this.connectionPromise = null;
    }
  }

  private async _doConnect(): Promise<void> {
    try {
      logger.info('Connecting to Quest Builder MCP via SSE...', { url: MCP_URL });

      if (!MCP_TOKEN) {
        throw new Error('MCP_TOKEN environment variable is required for MCP connection');
      }

      // Create SSE transport with authorization header
      const transport = new SSEClientTransport(
        new URL(MCP_URL),
        {
          requestInit: {
            headers: {
              'Authorization': `Bearer ${MCP_TOKEN}`,
            },
          },
        }
      );

      this.client = new Client(
        { name: 'discord-quest-bot', version: '1.0.0' },
        { capabilities: {} }
      );

      await this.client.connect(transport);
      this.connected = true;

      logger.info('Connected to Quest Builder MCP successfully via SSE');
    } catch (error) {
      logger.error('Failed to connect to Quest Builder MCP', { error });
      this.client = null;
      this.connected = false;
      throw error;
    }
  }

  /**
   * Ensure client is connected before making calls
   */
  private async ensureConnected(): Promise<Client> {
    if (!this.connected || !this.client) {
      await this.connect();
    }
    if (!this.client) {
      throw new Error('MCP client not connected');
    }
    return this.client;
  }

  /**
   * Create or update a connector in the MCP
   */
  async createOrUpdateConnector(
    definition: ConnectorDefinition
  ): Promise<CreateConnectorResult> {
    try {
      const client = await this.ensureConnected();

      logger.info('Creating connector via MCP', {
        name: definition.name,
        endpoint: definition.endpoint.substring(0, 50),
      });

      const result = await client.callTool({
        name: 'createOrUpdateConnector',
        arguments: definition as unknown as Record<string, unknown>,
      });

      // Parse the result
      const contentArray = result.content as Array<{ type: string; text?: string }>;
      const content = contentArray[0];
      if (content.type === 'text' && content.text) {
        const parsed = JSON.parse(content.text);
        logger.info('Connector created successfully', {
          connectorId: parsed.id,
          name: parsed.name,
        });
        return {
          id: parsed.id,
          name: parsed.name || definition.name,
          success: true,
        };
      }

      throw new Error('Unexpected response format from MCP');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to create connector', { error: errorMessage });
      return {
        id: 0,
        name: definition.name,
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Test a connector (fetch or validate mode)
   */
  async testConnector(params: TestConnectorParams): Promise<TestConnectorResult> {
    try {
      const client = await this.ensureConnected();

      logger.info('Testing connector via MCP', {
        connectorId: params.id,
        mode: params.mode,
      });

      const result = await client.callTool({
        name: 'testConnector',
        arguments: params as unknown as Record<string, unknown>,
      });

      // Parse the result
      const contentArray = result.content as Array<{ type: string; text?: string }>;
      const content = contentArray[0];
      if (content.type === 'text' && content.text) {
        const parsed = JSON.parse(content.text);
        logger.info('Connector test completed', {
          connectorId: params.id,
          mode: params.mode,
          status: parsed.status,
          isValid: parsed.isValid,
        });
        return parsed as TestConnectorResult;
      }

      throw new Error('Unexpected response format from MCP');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to test connector', {
        connectorId: params.id,
        error: errorMessage,
      });
      return {
        endpoint: '',
        method: '',
        status: 0,
        isValid: false,
        data: null,
        error: errorMessage,
      };
    }
  }

  /**
   * Validate quest completion using a connector
   */
  async validateQuestCompletion(
    connectorId: number,
    verificationType: string,
    identifier: string
  ): Promise<{ isValid: boolean; data?: unknown; error?: string }> {
    try {
      // Build variables based on verification type
      const variables: Record<string, string> = {};

      switch (verificationType) {
        case 'wallet_address':
          variables.walletAddress = identifier;
          break;
        case 'email':
          variables.emailAddress = identifier;
          break;
        case 'twitter_handle':
          variables.twitterHandle = identifier.replace('@', ''); // Remove @ if present
          break;
        case 'discord_id':
          variables.discordId = identifier;
          break;
        default:
          // Generic identifier
          variables.identifier = identifier;
      }

      const result = await this.testConnector({
        id: connectorId,
        mode: 'validate',
        variables,
      });

      return {
        isValid: result.isValid || false,
        data: result.data,
        error: result.error,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('MCP validation failed', { connectorId, error: errorMessage });
      return {
        isValid: false,
        error: `Connection error: ${errorMessage}`,
      };
    }
  }

  /**
   * Create or update a quest in the Summon MCP
   */
  async createOrUpdateQuest(
    definition: QuestDefinition
  ): Promise<CreateQuestResult> {
    try {
      const client = await this.ensureConnected();

      logger.info('Creating/updating quest via MCP', {
        id: definition.id,
        title: definition.title,
        taskCount: definition.tasks?.length || 0,
      });

      const result = await client.callTool({
        name: 'createOrUpdateQuest',
        arguments: definition as unknown as Record<string, unknown>,
      });

      // Parse the result
      const contentArray = result.content as Array<{ type: string; text?: string }>;
      const content = contentArray[0];
      if (content.type === 'text' && content.text) {
        const parsed = JSON.parse(content.text);
        // Handle nested response format (API returns { quest: {...} })
        const questData = parsed.quest || parsed;
        logger.info('Quest created/updated successfully', {
          questId: questData.id,
          title: questData.title,
        });
        return {
          id: questData.id,
          title: questData.title || definition.title,
          success: true,
        };
      }

      throw new Error('Unexpected response format from MCP');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to create/update quest', { error: errorMessage });
      return {
        id: 0,
        title: definition.title,
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * List quests from the Summon MCP
   */
  async listQuests(params?: ListQuestsParams): Promise<MCPQuest[]> {
    try {
      const client = await this.ensureConnected();

      logger.info('Listing quests via MCP', { params });

      const result = await client.callTool({
        name: 'listQuests',
        arguments: (params || {}) as unknown as Record<string, unknown>,
      });

      // Parse the result
      const contentArray = result.content as Array<{ type: string; text?: string }>;
      const content = contentArray[0];
      if (content.type === 'text' && content.text) {
        const parsed = JSON.parse(content.text);
        // Handle nested response format
        const quests = parsed.quests || parsed;
        logger.info('Quests retrieved successfully', {
          count: Array.isArray(quests) ? quests.length : 0,
        });
        return Array.isArray(quests) ? quests : [];
      }

      return [];
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to list quests', { error: errorMessage });
      return [];
    }
  }

  /**
   * Get a quest by ID from the Summon MCP
   */
  async getQuestById(id: number): Promise<MCPQuest | null> {
    try {
      const client = await this.ensureConnected();

      logger.info('Getting quest by ID via MCP', { id });

      const result = await client.callTool({
        name: 'getQuestById',
        arguments: { id } as unknown as Record<string, unknown>,
      });

      // Parse the result
      const contentArray = result.content as Array<{ type: string; text?: string }>;
      const content = contentArray[0];
      if (content.type === 'text' && content.text) {
        const parsed = JSON.parse(content.text);
        // Handle nested response format
        const questData = parsed.quest || parsed;
        logger.info('Quest retrieved successfully', {
          questId: questData.id,
          title: questData.title,
        });
        return questData as MCPQuest;
      }

      return null;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to get quest by ID', { id, error: errorMessage });
      return null;
    }
  }

  /**
   * Update quest status in the Summon MCP
   */
  async updateQuestStatus(
    id: number,
    status: 'READY' | 'LIVE' | 'PAUSED'
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const client = await this.ensureConnected();

      logger.info('Updating quest status via MCP', { id, status });

      const result = await client.callTool({
        name: 'updateQuestStatus',
        arguments: { id, status } as unknown as Record<string, unknown>,
      });

      // Parse the result
      const contentArray = result.content as Array<{ type: string; text?: string }>;
      const content = contentArray[0];
      if (content.type === 'text' && content.text) {
        logger.info('Quest status updated successfully', { id, status });
        return { success: true };
      }

      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to update quest status', { id, status, error: errorMessage });
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Delete a quest in the Summon MCP
   */
  async deleteQuest(id: number): Promise<{ success: boolean; error?: string }> {
    try {
      const client = await this.ensureConnected();

      logger.info('Deleting quest via MCP', { id });

      await client.callTool({
        name: 'deleteQuest',
        arguments: { id } as unknown as Record<string, unknown>,
      });

      logger.info('Quest deleted successfully', { id });
      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to delete quest', { id, error: errorMessage });
      return { success: false, error: errorMessage };
    }
  }

  /**
   * List available tags from the Summon MCP
   */
  async listTags(): Promise<QuestTag[]> {
    try {
      const client = await this.ensureConnected();

      logger.info('Listing tags via MCP');

      const result = await client.callTool({
        name: 'listTags',
        arguments: {},
      });

      // Parse the result
      const contentArray = result.content as Array<{ type: string; text?: string }>;
      const content = contentArray[0];
      if (content.type === 'text' && content.text) {
        const parsed = JSON.parse(content.text);
        const tags = parsed.tags || parsed;
        logger.info('Tags retrieved successfully', {
          count: Array.isArray(tags) ? tags.length : 0,
        });
        return Array.isArray(tags) ? tags : [];
      }

      return [];
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to list tags', { error: errorMessage });
      return [];
    }
  }

  /**
   * Disconnect from MCP
   */
  async disconnect(): Promise<void> {
    if (this.client) {
      try {
        await this.client.close();
        logger.info('Disconnected from Quest Builder MCP');
      } catch (error) {
        logger.error('Error disconnecting from MCP', { error });
      } finally {
        this.client = null;
        this.connected = false;
      }
    }
  }

  /**
   * Check if connected to MCP
   */
  isConnected(): boolean {
    return this.connected && this.client !== null;
  }
}

// Singleton instance
export const mcpClient = new MCPClient();

/**
 * Helper to build connector definition from quest creation data
 */
export function buildConnectorDefinition(params: {
  name: string;
  description: string;
  endpoint: string;
  method?: string;
  headers?: Record<string, string>;
  body?: Record<string, unknown>;
  validationPrompt?: string;
  validationFn?: ValidationDSL;
  apiKeyEnvVar?: string;
}): ConnectorDefinition {
  const headers: Record<string, string> = { ...params.headers };

  // If API key env var is specified, add authorization header with placeholder
  if (params.apiKeyEnvVar) {
    // Common patterns for API key headers
    if (!headers['Authorization'] && !headers['X-API-KEY'] && !headers['x-api-key']) {
      headers['Authorization'] = 'Bearer {{apiKey}}';
    }
  }

  return {
    name: params.name,
    description: params.description,
    endpoint: params.endpoint,
    method: (params.method as ConnectorDefinition['method']) || 'GET',
    headers,
    body: params.body || {},
    validationPrompt: params.validationPrompt,
    validationFn: params.validationFn,
  };
}

/**
 * Map verification type to MCP placeholder
 */
export function getPlaceholderForVerificationType(verificationType: string): string {
  const placeholderMap: Record<string, string> = {
    wallet_address: '{{walletAddress}}',
    email: '{{emailAddress}}',
    twitter_handle: '{{twitterHandle}}',
    discord_id: '{{discordId}}',
  };
  return placeholderMap[verificationType] || '{{identifier}}';
}
