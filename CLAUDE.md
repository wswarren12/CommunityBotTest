# CLAUDE.md - AI Assistant Guide & Change Log

This document serves as a guide for AI assistants (like Claude) working on this codebase and tracks significant changes made to the project.

## Project Overview

Discord Community Bot is an AI-powered bot that helps Discord community members stay engaged by providing personalized, on-demand activity summaries using the `/catchup` command.

## Architecture

### Tech Stack
- **Runtime**: Node.js 18+ with TypeScript
- **Discord Library**: discord.js v14
- **Database**: PostgreSQL with `pg` library
- **AI Provider**: Anthropic Claude API
- **Logging**: Winston

### Project Structure

```
/src
  /bot          # Discord client setup and event handlers
  /commands     # Slash command implementations
  /services     # Core business logic (AI, database, etc.)
  /utils        # Helper functions and utilities
  /db           # Database schemas, migrations, and queries
  /types        # TypeScript type definitions
/tests          # Unit and integration tests
/.claude
  /subagents    # Specialized AI subagent configurations
```

## Key Components

### 1. Discord Bot (`src/bot/`)
- Client initialization with required intents
- Event handlers for messages, interactions, and bot lifecycle
- Message Content Intent MUST be enabled

### 2. Commands (`src/commands/`)
- `/catchup` - Primary command for generating summaries
- Each command has its own handler module

### 3. Services (`src/services/`)
- **AI Service**: Claude API integration for summary generation
- **Database Service**: PostgreSQL queries and connection pooling
- **Message Service**: Message ingestion and retrieval
- **Summary Service**: Core summary generation logic
- **Event Service**: Event detection and surfacing

### 4. Database (`src/db/`)
- Tables:
  - `messages` - 30-day message retention
  - `users` - User metadata and last activity tracking
  - `user_activity` - Activity timestamps per channel
  - `channels` - Channel configuration
  - `events` - Detected and Discord events
- Migrations managed via custom scripts

## Development Guidelines

### Code Style
- Use TypeScript strict mode
- Follow async/await patterns (no raw promises)
- Use descriptive variable and function names
- Keep functions small and focused (single responsibility)
- Add JSDoc comments for public APIs

### Error Handling
- Always wrap async operations in try-catch blocks
- Log errors with context using Winston
- Provide user-friendly error messages in Discord responses
- Never expose sensitive information in errors

### Database Queries
- Use parameterized queries (prevent SQL injection)
- Implement connection pooling
- Close connections properly
- Handle transaction rollbacks

### AI Integration
- Respect rate limits (implement backoff)
- Cache responses when appropriate
- Handle API errors gracefully
- Monitor token usage

## AI Subagents

This repository uses specialized AI subagents for complex tasks. See `.claude/subagents/` for configurations:

1. **summary-generator** - Generates personalized activity summaries
2. **event-detector** - Detects event mentions in messages

### Using Subagents
Reference subagent configurations when working on related features. Subagents provide context-specific instructions and examples.

## Environment Variables

Required environment variables (see `.env.example`):
- `DISCORD_TOKEN` - Discord bot token
- `DISCORD_CLIENT_ID` - Discord application client ID
- `ANTHROPIC_API_KEY` - Claude API key
- `DATABASE_URL` - PostgreSQL connection string
- `NODE_ENV` - Environment (development/production)
- `LOG_LEVEL` - Logging level (debug/info/warn/error)

## Testing

- Write unit tests for all service functions
- Write integration tests for command handlers
- Mock external dependencies (Discord API, Claude API, Database)
- Test error scenarios

Run tests with: `npm test`

## Common Tasks

### Adding a New Command
1. Create handler in `src/commands/[command-name].ts`
2. Register in `src/bot/commandRegistry.ts`
3. Add tests in `tests/commands/[command-name].test.ts`

### Modifying Database Schema
1. Create migration script in `src/db/migrations/`
2. Update TypeScript types in `src/types/`
3. Test migration on development database
4. Document changes in this file

### Integrating New AI Features
1. Check if existing subagent applies or create new one
2. Implement in `src/services/aiService.ts`
3. Add prompt templates
4. Test with various inputs
5. Monitor token usage

## Permissions & Privacy

- Always validate user permissions before accessing channel data
- Respect role-based access control
- Never store or log sensitive user information
- Implement proper data retention policies (30 days)
- Handle GDPR/privacy requests appropriately

## Performance Considerations

- Use database indexes for frequent queries
- Implement caching for repeated operations
- Batch database operations when possible
- Paginate large result sets
- Monitor memory usage with large message histories

---

## Change Log

All significant changes to the project should be documented here.

### 2026-01-08 - Initial Project Setup
**Changed by**: Claude (AI Assistant)

**Changes**:
- Initialized Node.js project with TypeScript
- Created project structure with src/ and tests/ directories
- Setup package.json with core dependencies:
  - discord.js v14 for Discord API
  - @anthropic-ai/sdk for Claude integration
  - pg for PostgreSQL
  - winston for logging
- Created tsconfig.json with strict TypeScript configuration
- Added .gitignore for Node.js projects
- Created README.md with setup instructions
- Created CLAUDE.md for AI assistance and change tracking
- Setup .claude/subagents/ directory structure for AI subagents

**Next Steps**:
- Create CLAUDE.md subagent configurations
- Implement database schema and migrations
- Setup environment configuration
- Build Discord bot client initialization

---

### 2026-01-08 - Full Bot Implementation
**Changed by**: Claude (AI Assistant)

**Changes**:

**AI Subagent Infrastructure:**
- Created `.claude/subagents/subagent-template.md` - Template for creating new subagents
- Created `.claude/subagents/summary-generator.md` - Comprehensive guide for AI-powered summary generation
- Created `.claude/subagents/event-detector.md` - Guide for detecting events from messages using NLP

**Database Layer:**
- Implemented PostgreSQL schema with 6 core tables (`src/db/schema.sql`):
  - `users` - Discord user tracking with last activity
  - `channels` - Channel metadata and configuration
  - `messages` - 30-day message retention with full-text search capability
  - `user_activity` - Per-channel activity tracking
  - `events` - Discord native and AI-detected events
  - `summaries` - Generated summary caching and analytics
- Created database connection pooling (`src/db/connection.ts`)
- Implemented comprehensive query functions (`src/db/queries.ts`)
- Built migration system (`src/db/migrate.ts` and `src/db/migrations/001_initial_schema.ts`)
- Added TypeScript type definitions (`src/types/database.ts`)

**Discord Bot Core:**
- Created Discord client with required intents (`src/bot/client.ts`)
- Implemented event handlers:
  - `ready` - Bot startup and command registration (`src/bot/events/ready.ts`)
  - `messageCreate` - Message ingestion (`src/bot/events/messageCreate.ts`)
  - `interactionCreate` - Slash commands and buttons (`src/bot/events/interactionCreate.ts`)
- Built command registry system (`src/bot/commandRegistry.ts`)

**Services:**
- **Message Service** (`src/services/messageService.ts`):
  - Message ingestion with metadata extraction
  - Permission-based channel filtering
  - User activity tracking
- **AI Service** (`src/services/aiService.ts`):
  - Claude API integration
  - Summary generation with 3 detail levels (brief, detailed, full)
  - Event detection from natural language
  - Prompt engineering with context-aware templates
- **Summary Service** (`src/services/summaryService.ts`):
  - Catchup summary orchestration
  - Custom timeframe parsing (1h, 6h, 1d, etc.)
  - Conversation recommendations
  - Time-based filtering
- **Event Service** (`src/services/eventService.ts`):
  - Discord native event syncing
  - AI-powered event detection from messages
  - Event deduplication and confidence scoring
  - Upcoming events retrieval

**Commands:**
- Implemented `/catchup` command (`src/commands/catchup.ts`):
  - Ephemeral, personalized summaries
  - Interactive detail expansion with buttons (brief → detailed → full)
  - Custom timeframe support
  - Summary caching with 30-minute TTL

**Infrastructure:**
- Created main entry point with graceful shutdown (`src/index.ts`)
- Implemented Winston-based logging system (`src/utils/logger.ts`)
- Added background tasks:
  - 30-day message cleanup (configurable interval)
  - Periodic event detection (every 6 hours)
- Created `.env.example` with all configuration options
- Added Docker Compose for local PostgreSQL setup (`docker-compose.yml`)

**Development Tools:**
- Setup Jest testing framework (`jest.config.js`)
- Added ESLint configuration (`.eslintrc.json`)
- Added Prettier configuration (`.prettierrc.json`)
- Created example test file (`tests/services/summaryService.test.ts`)

**Features Implemented:**
✅ On-demand summary generation with `/catchup`
✅ Permission-respecting message filtering
✅ Expandable detail views (3 levels)
✅ AI-powered event detection
✅ Discord native event integration
✅ Conversation recommendations
✅ 30-day automatic message retention
✅ Mention tracking and highlighting
✅ Role-based content relevance
✅ Custom timeframe support
✅ Graceful error handling
✅ Background cleanup tasks

**Architecture Highlights:**
- Modular service-based architecture
- Strict TypeScript with comprehensive type safety
- Database connection pooling for performance
- Ephemeral responses for privacy
- Rate limit handling for Claude API
- Comprehensive logging for debugging
- Security-first permission checking

**Performance Optimizations:**
- Database indexes on frequently queried fields
- Message limit of 500 per summary to avoid token limits
- Connection pooling for database queries
- Summary caching for button interactions
- Automatic cleanup of expired cache entries

**Files Created:** 42 files across the entire project structure

**Ready for Deployment:** ✅
- Environment variables configured
- Database migrations ready
- Error handling in place
- Logging configured
- Background tasks scheduled

**Next Steps:**
- Run `npm install` to install dependencies
- Setup PostgreSQL database (use `docker-compose up -d`)
- Copy `.env.example` to `.env` and fill in credentials
- Run `npm run migrate` to create database schema
- Run `npm run build` to compile TypeScript
- Run `npm start` to launch the bot
- Invite bot to Discord server with proper permissions
- Test `/catchup` command

---

## Tips for AI Assistants

1. **Always check this file first** when starting work on the project
2. **Update the Change Log** after completing significant work
3. **Reference line numbers** when discussing code (e.g., `src/bot/client.ts:45`)
4. **Use subagents** for specialized tasks (summary generation, event detection)
5. **Test before committing** - run `npm run build` and `npm test`
6. **Follow the architecture** - don't create files outside the established structure
7. **Ask questions** if requirements are unclear
8. **Document your reasoning** when making architectural decisions

## Team Instructions

### For Developers
- Read this file before making changes
- Update the Change Log for significant modifications
- Follow the development guidelines above
- Use the provided npm scripts for common tasks

### For AI Assistants Working on This Project
- This bot handles sensitive community data - always prioritize security and privacy
- The 30-day message retention is a hard requirement
- Always test with various permission scenarios
- Consider rate limits for both Discord and Claude APIs
- Keep summaries concise and actionable (users want quick catch-ups)

### When to Create New Subagents
- Complex, repetitive AI tasks (like summary generation)
- Tasks requiring specific context or examples
- Natural language processing workflows
- Multi-step reasoning processes

---

**Last Updated**: 2026-01-08
**Maintained By**: Development Team + AI Assistants
