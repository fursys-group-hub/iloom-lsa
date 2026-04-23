-- 심화교육 시험 점수 테이블 + batches 컬럼 추가
-- Supabase SQL Editor에서 실행

-- 1. batches 테이블에 심화교육 시트/통과점수 컬럼 추가
ALTER TABLE batches ADD COLUMN IF NOT EXISTS advanced_sheet_id TEXT;
ALTER TABLE batches ADD COLUMN IF NOT EXISTS advanced_pass_score INTEGER DEFAULT 80;

-- 2. 심화교육 시험 점수 테이블 (재시험 여러 회차 지원)
CREATE TABLE IF NOT EXISTS advanced_test_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID REFERENCES students(id) ON DELETE CASCADE,
  batch_id UUID REFERENCES batches(id),
  week_number INTEGER NOT NULL CHECK (week_number BETWEEN 1 AND 12),
  sheet_attempt INTEGER,                -- 시트상 '회차' 원본 값 (참고용)
  score NUMERIC(5,2) NOT NULL,
  max_score NUMERIC(5,2) DEFAULT 100,
  wrong_parts TEXT,                     -- '틀린파트' 컬럼
  submitted_answers TEXT,               -- '제출한답' 컬럼 (보존용)
  submitted_at TIMESTAMPTZ NOT NULL,    -- '제출일시' (한글 포맷 → ISO)
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(student_id, week_number, submitted_at)
);

CREATE INDEX IF NOT EXISTS idx_advanced_scores_lookup
  ON advanced_test_scores(student_id, week_number, submitted_at);
