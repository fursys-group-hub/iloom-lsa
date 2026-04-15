-- 안성공장 인프라 투어 설문 테이블
-- 사전(pre) / 사후(post) 두 단계로 나뉘어 저장
-- 같은 학생이 같은 기수에서 사전/사후 각 1개씩 작성 가능

CREATE TABLE IF NOT EXISTS ansan_tour_surveys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  phase TEXT NOT NULL CHECK (phase IN ('pre', 'post')),

  -- ── 자가진단 9문항 (사전/사후 공통, 1~5점) ──
  know_products       INT CHECK (know_products       BETWEEN 1 AND 5),
  know_factory        INT CHECK (know_factory        BETWEEN 1 AND 5),
  know_sofa           INT CHECK (know_sofa           BETWEEN 1 AND 5),
  know_mattress       INT CHECK (know_mattress       BETWEEN 1 AND 5),
  know_steel          INT CHECK (know_steel          BETWEEN 1 AND 5),
  know_quality        INT CHECK (know_quality        BETWEEN 1 AND 5),
  know_competitive    INT CHECK (know_competitive    BETWEEN 1 AND 5),
  know_explain        INT CHECK (know_explain        BETWEEN 1 AND 5),
  know_value          INT CHECK (know_value          BETWEEN 1 AND 5),

  -- ── 사전 전용: 호기심/궁금증 (서술) ──
  curiosity_sofa      TEXT,
  curiosity_mattress  TEXT,
  curiosity_steel     TEXT,
  curiosity_quality   TEXT,
  curiosity_other     TEXT,

  -- ── 사후 전용: 투어 만족도 (1~5점) + NPS (0~10) ──
  sat_process         INT CHECK (sat_process   BETWEEN 1 AND 5),
  sat_helpful         INT CHECK (sat_helpful   BETWEEN 1 AND 5),
  sat_guide           INT CHECK (sat_guide     BETWEEN 1 AND 5),
  sat_operation       INT CHECK (sat_operation BETWEEN 1 AND 5),
  sat_duration        INT CHECK (sat_duration  BETWEEN 1 AND 5),
  nps                 INT CHECK (nps           BETWEEN 0 AND 10),

  -- ── 사후 전용: 인상 (선택 + 서술) ──
  best_line           TEXT,  -- '소파' | '매트리스' | '철제' | '품질검사' | '기타'
  best_reason         TEXT,
  learned_sofa        TEXT,
  learned_mattress    TEXT,
  learned_steel       TEXT,
  confident_to_say    TEXT,
  improvement         TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE (batch_id, student_id, phase)
);

CREATE INDEX IF NOT EXISTS ansan_tour_surveys_batch_idx
  ON ansan_tour_surveys (batch_id);

CREATE INDEX IF NOT EXISTS ansan_tour_surveys_student_idx
  ON ansan_tour_surveys (student_id);

-- updated_at 자동 갱신
CREATE OR REPLACE FUNCTION ansan_tour_surveys_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS ansan_tour_surveys_updated_at ON ansan_tour_surveys;
CREATE TRIGGER ansan_tour_surveys_updated_at
  BEFORE UPDATE ON ansan_tour_surveys
  FOR EACH ROW EXECUTE FUNCTION ansan_tour_surveys_set_updated_at();
