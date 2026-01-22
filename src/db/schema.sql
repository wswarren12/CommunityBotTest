-- Discord Community Bot Database Schema
-- PostgreSQL 12+

-- Users table: Track Discord users and their activity
CREATE TABLE IF NOT EXISTS users (
    user_id VARCHAR(20) PRIMARY KEY, -- Discord user ID (snowflake)
    username VARCHAR(32) NOT NULL,
    discriminator VARCHAR(4),
    global_name VARCHAR(32),
    guild_id VARCHAR(20) NOT NULL,
    joined_at TIMESTAMP WITH TIME ZONE NOT NULL,
    last_message_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Channels table: Track channel metadata and configuration
CREATE TABLE IF NOT EXISTS channels (
    channel_id VARCHAR(20) PRIMARY KEY, -- Discord channel ID (snowflake)
    guild_id VARCHAR(20) NOT NULL,
    channel_name VARCHAR(100) NOT NULL,
    channel_type VARCHAR(20) NOT NULL, -- text, voice, announcement, etc.
    parent_id VARCHAR(20), -- Parent category
    is_thread BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Messages table: Store message history (30-day retention)
CREATE TABLE IF NOT EXISTS messages (
    message_id VARCHAR(20) PRIMARY KEY, -- Discord message ID (snowflake)
    channel_id VARCHAR(20) NOT NULL REFERENCES channels(channel_id) ON DELETE CASCADE,
    user_id VARCHAR(20) NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    guild_id VARCHAR(20) NOT NULL,
    content TEXT NOT NULL,
    has_mentions BOOLEAN DEFAULT FALSE,
    mention_users TEXT[], -- Array of mentioned user IDs
    mention_roles TEXT[], -- Array of mentioned role IDs
    has_attachments BOOLEAN DEFAULT FALSE,
    attachment_count INTEGER DEFAULT 0,
    reply_to_message_id VARCHAR(20), -- If this is a reply
    thread_id VARCHAR(20), -- If in a thread
    posted_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- User activity tracking: Per-channel last activity timestamps
CREATE TABLE IF NOT EXISTS user_activity (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(20) NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    guild_id VARCHAR(20) NOT NULL,
    channel_id VARCHAR(20) NOT NULL REFERENCES channels(channel_id) ON DELETE CASCADE,
    last_activity_at TIMESTAMP WITH TIME ZONE NOT NULL,
    message_count INTEGER DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, guild_id, channel_id)
);

-- Events table: Store detected and Discord native events
CREATE TABLE IF NOT EXISTS events (
    id SERIAL PRIMARY KEY,
    event_id VARCHAR(100) UNIQUE, -- Discord event ID or generated hash
    guild_id VARCHAR(20) NOT NULL,
    title VARCHAR(200) NOT NULL,
    description TEXT,
    event_type VARCHAR(50) NOT NULL, -- meeting, gaming, stream, social, tournament, other
    scheduled_start TIMESTAMP WITH TIME ZONE NOT NULL,
    scheduled_end TIMESTAMP WITH TIME ZONE,
    location VARCHAR(200), -- Channel name or external location
    channel_id VARCHAR(20), -- If in a Discord channel
    organizer_user_id VARCHAR(20) REFERENCES users(user_id) ON DELETE SET NULL,
    source_type VARCHAR(20) NOT NULL, -- 'discord' or 'detected'
    source_message_id VARCHAR(20), -- Source message if detected
    confidence_score INTEGER, -- 0-100 for detected events
    is_cancelled BOOLEAN DEFAULT FALSE,
    is_recurring BOOLEAN DEFAULT FALSE,
    recurrence_rule TEXT, -- RRULE format or simple frequency
    participant_roles TEXT[], -- Array of role IDs
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Summaries table: Cache generated summaries for analytics
CREATE TABLE IF NOT EXISTS summaries (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(20) NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    guild_id VARCHAR(20) NOT NULL,
    summary_content TEXT NOT NULL,
    detail_level VARCHAR(20) NOT NULL, -- brief, detailed, full
    message_count INTEGER NOT NULL,
    time_range_start TIMESTAMP WITH TIME ZONE NOT NULL,
    time_range_end TIMESTAMP WITH TIME ZONE NOT NULL,
    satisfaction_rating INTEGER, -- 1-5 stars, if user provides feedback
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_messages_channel_posted ON messages(channel_id, posted_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_user_posted ON messages(user_id, posted_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_guild_posted ON messages(guild_id, posted_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_mentions ON messages(mention_users) WHERE has_mentions = TRUE;
CREATE INDEX IF NOT EXISTS idx_messages_posted_at ON messages(posted_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_activity_user_guild ON user_activity(user_id, guild_id);
CREATE INDEX IF NOT EXISTS idx_user_activity_channel ON user_activity(channel_id, last_activity_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_guild_scheduled ON events(guild_id, scheduled_start) WHERE is_cancelled = FALSE;
CREATE INDEX IF NOT EXISTS idx_events_channel ON events(channel_id) WHERE channel_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_summaries_user ON summaries(user_id, created_at DESC);

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_channels_updated_at ON channels;
CREATE TRIGGER update_channels_updated_at BEFORE UPDATE ON channels
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_user_activity_updated_at ON user_activity;
CREATE TRIGGER update_user_activity_updated_at BEFORE UPDATE ON user_activity
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_events_updated_at ON events;
CREATE TRIGGER update_events_updated_at BEFORE UPDATE ON events
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to clean up old messages (30-day retention)
CREATE OR REPLACE FUNCTION cleanup_old_messages()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM messages
    WHERE posted_at < NOW() - INTERVAL '30 days';

    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- View for user statistics
CREATE OR REPLACE VIEW user_stats AS
SELECT
    u.user_id,
    u.username,
    u.guild_id,
    COUNT(DISTINCT m.message_id) as total_messages,
    COUNT(DISTINCT m.channel_id) as active_channels,
    MAX(m.posted_at) as last_message_at,
    COUNT(DISTINCT DATE(m.posted_at)) as active_days
FROM users u
LEFT JOIN messages m ON u.user_id = m.user_id
GROUP BY u.user_id, u.username, u.guild_id;

-- View for channel activity
CREATE OR REPLACE VIEW channel_activity AS
SELECT
    c.channel_id,
    c.channel_name,
    c.guild_id,
    COUNT(m.message_id) as message_count,
    COUNT(DISTINCT m.user_id) as unique_users,
    MAX(m.posted_at) as last_activity_at,
    MIN(m.posted_at) as first_activity_at
FROM channels c
LEFT JOIN messages m ON c.channel_id = m.channel_id
WHERE m.posted_at > NOW() - INTERVAL '7 days'
GROUP BY c.channel_id, c.channel_name, c.guild_id;
