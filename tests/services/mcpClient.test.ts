import { describe, it, expect } from '@jest/globals';
import {
  buildConnectorDefinition,
  getPlaceholderForVerificationType,
  ConnectorDefinition,
  ValidationDSL,
} from '../../src/services/mcpClient';

describe('buildConnectorDefinition', () => {
  it('should build basic connector definition', () => {
    const result = buildConnectorDefinition({
      name: 'Test Connector',
      description: 'Test description',
      endpoint: 'https://api.example.com/test',
    });

    expect(result.name).toBe('Test Connector');
    expect(result.description).toBe('Test description');
    expect(result.endpoint).toBe('https://api.example.com/test');
    expect(result.method).toBe('GET');
    expect(result.body).toEqual({});
  });

  it('should add authorization header when apiKeyEnvVar is specified', () => {
    const result = buildConnectorDefinition({
      name: 'Test',
      description: 'Test',
      endpoint: 'https://api.example.com/test',
      apiKeyEnvVar: 'MY_API_KEY',
    });

    expect(result.headers['Authorization']).toBe('Bearer {{apiKey}}');
  });

  it('should not override existing Authorization header', () => {
    const result = buildConnectorDefinition({
      name: 'Test',
      description: 'Test',
      endpoint: 'https://api.example.com/test',
      apiKeyEnvVar: 'MY_API_KEY',
      headers: { 'Authorization': 'Custom Auth' },
    });

    expect(result.headers['Authorization']).toBe('Custom Auth');
  });

  it('should preserve custom headers', () => {
    const result = buildConnectorDefinition({
      name: 'Test',
      description: 'Test',
      endpoint: 'https://api.example.com/test',
      headers: {
        'X-Custom-Header': 'custom-value',
        'Accept': 'application/json',
      },
    });

    expect(result.headers['X-Custom-Header']).toBe('custom-value');
    expect(result.headers['Accept']).toBe('application/json');
  });

  it('should include validation function when provided', () => {
    const validationFn: ValidationDSL = {
      op: 'count',
      path: 'items',
      compare: '>',
      value: 0,
    };

    const result = buildConnectorDefinition({
      name: 'Test',
      description: 'Test',
      endpoint: 'https://api.example.com/test',
      validationFn,
    });

    expect(result.validationFn).toEqual(validationFn);
  });

  it('should include body when provided', () => {
    const body = { key: 'value', nested: { data: 123 } };

    const result = buildConnectorDefinition({
      name: 'Test',
      description: 'Test',
      endpoint: 'https://api.example.com/test',
      body,
    });

    expect(result.body).toEqual(body);
  });

  it('should use specified method', () => {
    const result = buildConnectorDefinition({
      name: 'Test',
      description: 'Test',
      endpoint: 'https://api.example.com/test',
      method: 'POST',
    });

    expect(result.method).toBe('POST');
  });
});

describe('getPlaceholderForVerificationType', () => {
  it('should return correct placeholder for wallet_address', () => {
    expect(getPlaceholderForVerificationType('wallet_address')).toBe('{{walletAddress}}');
  });

  it('should return correct placeholder for email', () => {
    expect(getPlaceholderForVerificationType('email')).toBe('{{emailAddress}}');
  });

  it('should return correct placeholder for twitter_handle', () => {
    expect(getPlaceholderForVerificationType('twitter_handle')).toBe('{{twitterHandle}}');
  });

  it('should return correct placeholder for discord_id', () => {
    expect(getPlaceholderForVerificationType('discord_id')).toBe('{{discordId}}');
  });

  it('should return generic placeholder for unknown types', () => {
    expect(getPlaceholderForVerificationType('unknown')).toBe('{{identifier}}');
    expect(getPlaceholderForVerificationType('')).toBe('{{identifier}}');
  });
});

describe('ValidationDSL Types', () => {
  it('should support count operation', () => {
    const validation: ValidationDSL = {
      op: 'count',
      path: 'items',
      compare: '>',
      value: 0,
    };
    expect(validation.op).toBe('count');
  });

  it('should support sum operation', () => {
    const validation: ValidationDSL = {
      op: 'sum',
      path: 'transactions.amount',
      compare: '>=',
      value: 100,
    };
    expect(validation.op).toBe('sum');
  });

  it('should support compare operation', () => {
    const validation: ValidationDSL = {
      op: 'compare',
      path: 'data.balance',
      compare: '=',
      value: 500,
    };
    expect(validation.op).toBe('compare');
  });

  it('should support exists operation', () => {
    const validation: ValidationDSL = {
      op: 'exists',
      path: 'user.verified',
    };
    expect(validation.op).toBe('exists');
  });

  it('should support where clause', () => {
    const validation: ValidationDSL = {
      op: 'count',
      path: 'items',
      where: { status: 'completed' },
      compare: '>',
      value: 0,
    };
    expect(validation.where).toEqual({ status: 'completed' });
  });

  it('should support complex where clause with and/or', () => {
    const validation: ValidationDSL = {
      op: 'count',
      path: 'items',
      where: {
        and: [{ status: 'completed' }, { type: 'nft' }],
      },
      compare: '>=',
      value: 1,
    };
    expect(validation.where?.and).toHaveLength(2);
  });
});

describe('ConnectorDefinition interface', () => {
  it('should allow all required fields', () => {
    const connector: ConnectorDefinition = {
      name: 'Test Connector',
      endpoint: 'https://api.example.com/test',
      method: 'GET',
      headers: {},
      body: {},
    };

    expect(connector.name).toBe('Test Connector');
    expect(connector.method).toBe('GET');
  });

  it('should allow optional fields', () => {
    const connector: ConnectorDefinition = {
      name: 'Test',
      description: 'Optional description',
      endpoint: 'https://api.example.com',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: { key: 'value' },
      validationPrompt: 'Check balance > 0',
      validationFn: {
        op: 'compare',
        path: 'balance',
        compare: '>',
        value: 0,
      },
    };

    expect(connector.description).toBe('Optional description');
    expect(connector.validationPrompt).toBe('Check balance > 0');
    expect(connector.validationFn?.op).toBe('compare');
  });

  it('should support all HTTP methods', () => {
    const methods: Array<ConnectorDefinition['method']> = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'];

    methods.forEach(method => {
      const connector: ConnectorDefinition = {
        name: 'Test',
        endpoint: 'https://api.example.com',
        method,
        headers: {},
        body: {},
      };
      expect(connector.method).toBe(method);
    });
  });
});
