-- =====================================
-- Threadline Database Schema
-- SQLite
-- =====================================

-- Threadline archives/workspaces
CREATE TABLE IF NOT EXISTS threadlines (
    id TEXT PRIMARY KEY,
    owner_id TEXT NOT NULL,
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

-- Ingestion and Curated Timeline additions
CREATE TABLE IF NOT EXISTS imports (
    id TEXT PRIMARY KEY,
    owner_id TEXT NOT NULL,
    filename TEXT NOT NULL,
    source TEXT NOT NULL,
    platform TEXT NOT NULL,
    file_size INTEGER,
    message_count INTEGER DEFAULT 0,
    participant_count INTEGER DEFAULT 0,
    thread_count INTEGER DEFAULT 0,
    earliest_timestamp INTEGER,
    latest_timestamp INTEGER,
    imported_at TEXT NOT NULL,
    status TEXT NOT NULL,
    errors TEXT
);

CREATE TABLE IF NOT EXISTS message_imports (
    message_id TEXT NOT NULL,
    import_id TEXT NOT NULL,
    PRIMARY KEY (message_id, import_id),
    FOREIGN KEY (message_id) REFERENCES messages (id) ON DELETE CASCADE,
    FOREIGN KEY (import_id) REFERENCES imports (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS saved_segments (
    id TEXT PRIMARY KEY,
    owner_id TEXT NOT NULL,
    conversation_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    start_time INTEGER NOT NULL,
    end_time INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (conversation_id) REFERENCES conversations (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS saved_segment_messages (
    saved_segment_id TEXT NOT NULL,
    message_id TEXT NOT NULL,
    PRIMARY KEY (saved_segment_id, message_id),
    FOREIGN KEY (saved_segment_id) REFERENCES saved_segments (id) ON DELETE CASCADE,
    FOREIGN KEY (message_id) REFERENCES messages (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS threadline_segments (
    threadline_id TEXT NOT NULL,
    saved_segment_id TEXT NOT NULL,
    PRIMARY KEY (threadline_id, saved_segment_id),
    FOREIGN KEY (threadline_id) REFERENCES threadlines (id) ON DELETE CASCADE,
    FOREIGN KEY (saved_segment_id) REFERENCES saved_segments (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_message_imports_msg ON message_imports(message_id);
CREATE INDEX IF NOT EXISTS idx_saved_segments_owner ON saved_segments(owner_id);
CREATE INDEX IF NOT EXISTS idx_saved_segment_messages_seg ON saved_segment_messages(saved_segment_id);
CREATE INDEX IF NOT EXISTS idx_threadline_segments_tl ON threadline_segments(threadline_id);
