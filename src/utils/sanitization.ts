import crypto from 'crypto';

/**
 * Sanitize content for AI prompts to prevent injection attacks
 */
export function sanitizeForPrompt(content: string): string {
  if (!content) return '';

  return content
    // Remove code blocks that could break out of context
    .replace(/```/g, '｀｀｀') // Replace with full-width characters
    .replace(/`/g, '｀')

    // Remove XML/control tags
    .replace(/<\|.*?\|>/g, '')
    .replace(/<\/?(?:system|assistant|human|user)>/gi, '')

    // Remove potential anthropic-specific tokens
    .replace(/\[INST\]/gi, '')
    .replace(/\[\/INST\]/gi, '')

    // Limit consecutive newlines
    .replace(/\n{4,}/g, '\n\n\n')

    // Trim whitespace
    .trim();
}

/**
 * Sanitize and truncate content
 */
export function sanitizeAndTruncate(content: string, maxLength: number): string {
  const sanitized = sanitizeForPrompt(content);
  return sanitized.substring(0, maxLength);
}

/**
 * Create a hash of query for log correlation without exposing content
 */
export function hashQueryForLogs(queryText: string): string {
  return crypto.createHash('sha256').update(queryText).digest('hex').substring(0, 12);
}
