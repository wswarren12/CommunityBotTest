# Quick Start Guide

Get your Discord Community Bot up and running in minutes!

## Prerequisites

- Node.js 18+ installed
- PostgreSQL database (or use Docker Compose)
- Discord bot token
- Anthropic API key

## Step 1: Install Dependencies

```bash
npm install
```

## Step 2: Setup Database

### Option A: Using Docker Compose (Recommended)

```bash
docker-compose up -d
```

This will start a PostgreSQL database on `localhost:5432` with these credentials:
- Database: `discord_bot`
- Username: `discord_bot`
- Password: `discord_bot_password`

### Option B: Using Existing PostgreSQL

Make sure you have PostgreSQL running and create a database for the bot.

## Step 3: Configure Environment

```bash
cp .env.example .env
```

Edit `.env` and fill in your credentials:

```env
# Discord Bot Configuration
DISCORD_TOKEN=your_discord_bot_token_here
DISCORD_CLIENT_ID=your_discord_client_id_here

# Anthropic Claude API
ANTHROPIC_API_KEY=your_anthropic_api_key_here

# Database Configuration
DATABASE_URL=postgresql://discord_bot:discord_bot_password@localhost:5432/discord_bot

# Environment
NODE_ENV=development

# Logging
LOG_LEVEL=info
```

### Getting Your Discord Bot Token

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Create a new application or select an existing one
3. Go to the "Bot" section
4. Click "Reset Token" to get your bot token
5. **Important:** Enable "Message Content Intent" under Privileged Gateway Intents
6. Copy the Client ID from the "OAuth2" section

### Getting Your Anthropic API Key

1. Go to [Anthropic Console](https://console.anthropic.com/)
2. Sign up or log in
3. Go to API Keys section
4. Create a new API key

## Step 4: Run Database Migrations

```bash
npm run migrate
```

This will create all necessary tables, indexes, and functions in your database.

## Step 5: Build the Project

```bash
npm run build
```

## Step 6: Start the Bot

### Development Mode (with auto-reload)

```bash
npm run dev
```

### Production Mode

```bash
npm start
```

You should see:
```
Discord bot logged in as YourBotName#1234
Bot is ready
Slash commands registered successfully
```

## Step 7: Invite Bot to Your Server

Generate an invite URL with these permissions:

```
https://discord.com/api/oauth2/authorize?client_id=YOUR_CLIENT_ID&permissions=277025508352&scope=bot%20applications.commands
```

Replace `YOUR_CLIENT_ID` with your Discord Client ID.

**Required Permissions:**
- View Channels
- Send Messages
- Read Message History
- Use Slash Commands

## Step 8: Test the Bot

In your Discord server, type:

```
/catchup
```

The bot should respond with a personalized summary of activity since your last message!

## Common Issues

### "Missing required environment variables"
- Double-check your `.env` file has all required variables
- Make sure variable names match exactly (case-sensitive)

### "Failed to connect to database"
- Verify PostgreSQL is running: `docker-compose ps` or check your local PostgreSQL service
- Check your `DATABASE_URL` is correct
- Test connection: `psql postgresql://discord_bot:discord_bot_password@localhost:5432/discord_bot`

### "Message Content Intent not enabled"
- Go to Discord Developer Portal → Your App → Bot
- Enable "Message Content Intent" under Privileged Gateway Intents
- Restart your bot

### "Claude API connection failed"
- Verify your `ANTHROPIC_API_KEY` is correct
- Check your Anthropic account has available credits
- Test API access at [Anthropic Console](https://console.anthropic.com/)

### Bot doesn't respond to /catchup
- Wait a few minutes after inviting the bot (slash commands take time to register globally)
- Try kicking and re-inviting the bot
- Check bot logs: `logs/combined.log`

## Development Commands

```bash
# Install dependencies
npm install

# Run in development mode (auto-reload)
npm run dev

# Build TypeScript
npm run build

# Start production server
npm start

# Run database migrations
npm run migrate

# Run tests
npm test

# Lint code
npm run lint

# Format code
npm run format

# Watch for changes (TypeScript compilation)
npm run watch
```

## Project Structure

```
/src
  /bot          # Discord client and event handlers
  /commands     # Slash command implementations
  /services     # Business logic (AI, database, etc.)
  /utils        # Helper functions
  /db           # Database schema, migrations, queries
  /types        # TypeScript types

/tests          # Unit and integration tests

/.claude
  /subagents    # AI subagent configurations

/logs           # Application logs (auto-generated)
```

## Next Steps

1. **Read the README.md** for detailed documentation
2. **Check CLAUDE.md** for AI assistance guidelines and architecture notes
3. **Explore .claude/subagents/** to understand AI-powered features
4. **Customize prompts** in `src/services/aiService.ts` for your community's tone
5. **Add more commands** by following the pattern in `src/commands/catchup.ts`

## Support

- Check logs in `logs/` directory for error details
- Review `CLAUDE.md` for architecture and troubleshooting
- Ensure all environment variables are set correctly
- Verify bot has proper Discord permissions

## Production Deployment

For production deployment:

1. Set `NODE_ENV=production` in `.env`
2. Use a managed PostgreSQL database (not Docker)
3. Set up proper logging and monitoring
4. Configure `LOG_LEVEL=warn` or `error`
5. Use a process manager like PM2:
   ```bash
   npm install -g pm2
   pm2 start dist/index.js --name discord-bot
   ```

## Success! 🎉

Your Discord Community Bot is now running! Users can type `/catchup` to get personalized activity summaries powered by Claude AI.

**Pro Tip:** Let the bot run for a few hours to collect message history before testing summaries. The more data it has, the better the summaries!
