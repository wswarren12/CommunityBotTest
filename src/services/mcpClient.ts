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
