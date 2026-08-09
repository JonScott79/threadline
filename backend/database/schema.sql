-- =====================================
-- Threadline Database Schema
-- SQLite
-- =====================================

-- Threadline archives/workspaces
CREATE TABLE IF NOT EXISTS threadlines (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    source TEXT NOT NULL,
    platform TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    message_count INTEGER DEFAULT 0,
    conversation_count INTEGER DEFAULT 0
);

-- Participants across conversations
CREATE TABLE IF NOT EXISTS participants (
    id TEXT PRIMARY KEY,
    threadline_id TEXT NOT NULL,
    name TEXT,
    phone_number TEXT,
    email TEXT,
    platform_identifiers TEXT, -- JSON stringified array of identifiers
    aliases TEXT, -- JSON stringified array of aliases
    metadata TEXT, -- JSON stringified additional data
    FOREIGN KEY (threadline_id) REFERENCES threadlines (id) ON DELETE CASCADE
);

-- Conversations grouping messages
CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    threadline_id TEXT NOT NULL,
    platform TEXT,
    title TEXT,
    start_date INTEGER, -- Unix timestamp in ms
    end_date INTEGER,   -- Unix timestamp in ms
    message_count INTEGER DEFAULT 0,
    metadata TEXT, -- JSON stringified metadata
    FOREIGN KEY (threadline_id) REFERENCES threadlines (id) ON DELETE CASCADE
);

-- Many-to-many relationship between conversations and participants
CREATE TABLE IF NOT EXISTS conversation_participants (
    conversation_id TEXT NOT NULL,
    participant_id TEXT NOT NULL,
    PRIMARY KEY (conversation_id, participant_id),
    FOREIGN KEY (conversation_id) REFERENCES conversations (id) ON DELETE CASCADE,
    FOREIGN KEY (participant_id) REFERENCES participants (id) ON DELETE CASCADE
);

-- Messages
CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    threadline_id TEXT NOT NULL,
    sender TEXT,
    recipient TEXT,
    timestamp INTEGER NOT NULL, -- Unix timestamp in ms
    body TEXT,
    attachments TEXT, -- JSON stringified list of attachments
    platform TEXT,
    direction TEXT, -- 'sent' or 'received'
    metadata TEXT, -- JSON stringified metadata
    FOREIGN KEY (conversation_id) REFERENCES conversations (id) ON DELETE CASCADE,
    FOREIGN KEY (threadline_id) REFERENCES threadlines (id) ON DELETE CASCADE
);

-- Extensible Chronological Events for Timeline
CREATE TABLE IF NOT EXISTS timeline_events (
    id TEXT PRIMARY KEY,
    threadline_id TEXT NOT NULL,
    timestamp INTEGER NOT NULL, -- Unix timestamp in ms
    type TEXT NOT NULL, -- 'message', 'call', 'meeting', 'custom'
    source_id TEXT, -- references message_id, etc.
    title TEXT,
    description TEXT,
    sender TEXT,
    metadata TEXT, -- JSON stringified metadata
    FOREIGN KEY (threadline_id) REFERENCES threadlines (id) ON DELETE CASCADE
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_messages_threadline_time ON messages(threadline_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_timeline_events_threadline_time ON timeline_events(threadline_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_participants_threadline ON participants(threadline_id);
