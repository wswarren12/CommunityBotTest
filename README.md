# Discord Community Bot

An AI-powered Discord bot that helps community members stay engaged by providing personalized, on-demand activity summaries.

## Features

- **On-Demand Summaries**: Get personalized activity summaries with the `/catchup` command
- **Smart Context**: Summaries cover activity since your last message, respecting channel permissions
- **Interactive Detail Views**: Expand summaries to see more detail with interactive buttons
- **Event Surfacing**: Discover Discord events and AI-detected event mentions
- **Conversation Recommendations**: Get suggestions for active threads based on your interests

## Prerequisites

- Node.js 18.0.0 or higher
- PostgreSQL database
- Discord Bot Token with Message Content Intent enabled
- Anthropic API key for Claude

## Setup

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Configure environment variables**:
   Copy `.env.example` to `.env` and fill in your credentials:
   ```bash
   cp .env.example .env
   ```

3. **Setup database**:
   Create a PostgreSQL database and run migrations:
   ```bash
   npm run migrate
   ```

4. **Build the project**:
   ```bash
   npm run build
   ```

5. **Start the bot**:
   ```bash
   npm start
   ```

   For development with auto-reload:
   ```bash
   npm run dev
   ```

## Discord Bot Setup

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Create a new application
3. Navigate to the "Bot" section
4. Enable "Message Content Intent" under Privileged Gateway Intents
5. Copy the bot token and add it to your `.env` file
6. Invite the bot to your server with the following permissions:
   - Read Messages/View Channels
   - Send Messages
   - Use Slash Commands
   - Read Message History

## Commands

- `/catchup` - Get a personalized summary of activity since your last message

## Architecture

- **Backend**: Node.js + TypeScript
- **Discord Library**: discord.js v14
- **Database**: PostgreSQL
- **AI**: Anthropic Claude API
- **Message Retention**: 30 days

## Development

```bash
# Run in development mode
npm run dev

# Run tests
npm run test

# Lint code
npm run lint

# Format code
npm run format
```

## Documentation

- See [CLAUDE.md](./CLAUDE.md) for development notes and AI assistance guidelines
- Check `.claude/subagents/` for specialized AI subagent configurations

## License

MIT
