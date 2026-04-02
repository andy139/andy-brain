-- knowledge_entries table
CREATE TABLE IF NOT EXISTS knowledge_entries (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  content     text        NOT NULL,
  source_url  text,
  source_type text        NOT NULL,
  tags        text[]      DEFAULT '{}',
  notes       text,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

-- Indexes for common filter patterns
CREATE INDEX IF NOT EXISTS idx_knowledge_entries_source_type
  ON knowledge_entries (source_type);

CREATE INDEX IF NOT EXISTS idx_knowledge_entries_tags
  ON knowledge_entries USING gin (tags);

CREATE INDEX IF NOT EXISTS idx_knowledge_entries_created_at
  ON knowledge_entries (created_at DESC);

-- Auto-update updated_at on row modification
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER knowledge_entries_updated_at
  BEFORE UPDATE ON knowledge_entries
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();
