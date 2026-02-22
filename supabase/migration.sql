-- ═══════════════════════════════════════════════════════
-- Quantum Rummy Dashboard — Supabase Schema Migration
-- Run this in the Supabase SQL Editor
-- ═══════════════════════════════════════════════════════

-- 1. Players Table
CREATE TABLE IF NOT EXISTS players (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  email TEXT DEFAULT '',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Game Sessions Table
CREATE TABLE IF NOT EXISTS game_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_date DATE NOT NULL,
  session_name TEXT NOT NULL,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'completed')),
  table_number INTEGER DEFAULT 1,
  game_type TEXT DEFAULT 'strike' CHECK (game_type IN ('strike', 'pool')),
  pool_limit INTEGER,
  penalty_first_drop INTEGER DEFAULT 20,
  penalty_middle_drop INTEGER DEFAULT 40,
  penalty_full_count INTEGER DEFAULT 80,
  penalty_wrong_show INTEGER DEFAULT 80,
  created_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);

-- 3. Rounds Table
CREATE TABLE IF NOT EXISTS rounds (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID REFERENCES game_sessions(id) ON DELETE CASCADE,
  round_number INTEGER NOT NULL,
  round_label TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Round Scores Table
CREATE TABLE IF NOT EXISTS round_scores (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  round_id UUID REFERENCES rounds(id) ON DELETE CASCADE,
  player_id UUID REFERENCES players(id) ON DELETE CASCADE,
  game1 INTEGER DEFAULT 0,
  game2 INTEGER DEFAULT 0,
  game3 INTEGER DEFAULT 0,
  game4 INTEGER DEFAULT 0,
  game5 INTEGER DEFAULT 0,
  game6 INTEGER DEFAULT 0,
  game7 INTEGER DEFAULT 0,
  game8 INTEGER DEFAULT 0,
  game9 INTEGER DEFAULT 0,
  game10 INTEGER DEFAULT 0,
  round_total INTEGER GENERATED ALWAYS AS (
    game1 + game2 + game3 + game4 + game5 + 
    game6 + game7 + game8 + game9 + game10
  ) STORED,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 5. Final Totals Table
CREATE TABLE IF NOT EXISTS final_totals (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID REFERENCES game_sessions(id) ON DELETE CASCADE,
  player_id UUID REFERENCES players(id) ON DELETE CASCADE,
  sr_current INTEGER DEFAULT 0,
  total INTEGER DEFAULT 0,
  adj1 INTEGER DEFAULT 0,
  adj2 INTEGER DEFAULT 0,
  adj3 INTEGER DEFAULT 0,
  adj4 INTEGER DEFAULT 0,
  adj5 INTEGER DEFAULT 0,
  adj6 INTEGER DEFAULT 0,
  adj7 INTEGER DEFAULT 0,
  adj8 INTEGER DEFAULT 0,
  final_total INTEGER GENERATED ALWAYS AS (
    total + adj1 + adj2 + adj3 + adj4 + adj5 + adj6 + adj7 + adj8
  ) STORED,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 6. Pool Scores Table
CREATE TABLE IF NOT EXISTS pool_scores (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID REFERENCES game_sessions(id) ON DELETE CASCADE,
  player_id UUID REFERENCES players(id) ON DELETE CASCADE,
  total_score INTEGER DEFAULT 0,
  field_points INTEGER DEFAULT 0,
  is_eliminated BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ═══════════════════════════════════════════════════════
-- Indexes for Performance
-- ═══════════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_rounds_session ON rounds(session_id);
CREATE INDEX IF NOT EXISTS idx_round_scores_round ON round_scores(round_id);
CREATE INDEX IF NOT EXISTS idx_round_scores_player ON round_scores(player_id);
CREATE INDEX IF NOT EXISTS idx_final_totals_session ON final_totals(session_id);
CREATE INDEX IF NOT EXISTS idx_final_totals_player ON final_totals(player_id);
CREATE INDEX IF NOT EXISTS idx_pool_scores_session ON pool_scores(session_id);
CREATE INDEX IF NOT EXISTS idx_game_sessions_status ON game_sessions(status);

-- ═══════════════════════════════════════════════════════
-- Row Level Security (RLS) — Public access for now
-- (Update these policies once authentication is added)
-- ═══════════════════════════════════════════════════════
ALTER TABLE players ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE rounds ENABLE ROW LEVEL SECURITY;
ALTER TABLE round_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE final_totals ENABLE ROW LEVEL SECURITY;
ALTER TABLE pool_scores ENABLE ROW LEVEL SECURITY;

-- Allow public read/write for all tables (anon key access)
CREATE POLICY "Allow public access on players" ON players FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public access on game_sessions" ON game_sessions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public access on rounds" ON rounds FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public access on round_scores" ON round_scores FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public access on final_totals" ON final_totals FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public access on pool_scores" ON pool_scores FOR ALL USING (true) WITH CHECK (true);

-- ═══════════════════════════════════════════════════════
-- Seed Initial Players (from your existing roster)
-- ═══════════════════════════════════════════════════════
INSERT INTO players (name, email, is_active) VALUES
  ('JK', '', true),
  ('Bhakta', '', true),
  ('Srikar', '', true),
  ('Leon', '', true),
  ('Sudheer', '', true),
  ('Krishna', '', true),
  ('Bhaskar', '', true),
  ('Srini', '', true),
  ('Koganti', '', true),
  ('Doddapaneni', '', true),
  ('Simha', '', true),
  ('Kurmana', '', true),
  ('KoneruS', '', true),
  ('Jetti', '', true),
  ('Bharath', '', true),
  ('Sasi', '', true),
  ('Vattikuti', '', true),
  ('Kolla', '', true),
  ('HariS', '', true)
ON CONFLICT (name) DO NOTHING;
