import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!
);

export type KnowledgeEntry = {
  id: string;
  content: string;
  source_url: string | null;
  source_type: string;
  tags: string[];
  notes: string | null;
  created_at: string;
  updated_at: string;
};
