-- gsyen 聊天会话 & 消息记录
-- Shares the HalfSphere Supabase instance; gsyen_ prefix avoids collisions.

-- ─── Chat Sessions ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS gsyen_chat_sessions (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title      TEXT        NOT NULL DEFAULT '新对话',
  model      TEXT        NOT NULL DEFAULT 'kimi',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE gsyen_chat_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "gsyen_chat_sessions: owner full access"
  ON gsyen_chat_sessions FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_gsyen_chat_sessions_user ON gsyen_chat_sessions (user_id, updated_at DESC);

-- ─── Chat Messages ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS gsyen_chat_messages (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID        NOT NULL REFERENCES gsyen_chat_sessions(id) ON DELETE CASCADE,
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role       TEXT        NOT NULL CHECK (role IN ('user', 'model')),
  content    TEXT        NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE gsyen_chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "gsyen_chat_messages: owner full access"
  ON gsyen_chat_messages FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_gsyen_chat_messages_session ON gsyen_chat_messages (session_id, created_at ASC);

-- ─── updated_at trigger for sessions ─────────────────────────────────────────

CREATE TRIGGER gsyen_chat_sessions_updated_at
  BEFORE UPDATE ON gsyen_chat_sessions
  FOR EACH ROW EXECUTE FUNCTION gsyen_set_updated_at();
