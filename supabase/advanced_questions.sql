-- 심화교육 문제은행 테이블
-- Supabase SQL Editor에서 실행

CREATE TABLE IF NOT EXISTS advanced_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID REFERENCES batches(id) ON DELETE CASCADE,
  week_number INTEGER NOT NULL CHECK (week_number BETWEEN 1 AND 12),
  session INTEGER NOT NULL DEFAULT 1,         -- 차시 (1/2/...)
  question_id TEXT NOT NULL,                  -- "1", "1-1" 같은 식별자
  question_text TEXT NOT NULL DEFAULT '',
  correct_answer TEXT DEFAULT '',
  scoring_mode TEXT DEFAULT '',               -- 주관식_단답, 주관식_순서무관 등
  max_score NUMERIC(5,2) DEFAULT 1,
  category TEXT DEFAULT '',
  series TEXT DEFAULT '',
  detail TEXT DEFAULT '',
  options TEXT DEFAULT '',
  explanation TEXT DEFAULT '',
  image_url TEXT,
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(batch_id, week_number, session, question_id)
);

CREATE INDEX IF NOT EXISTS idx_advanced_questions_lookup
  ON advanced_questions(batch_id, week_number, session);
