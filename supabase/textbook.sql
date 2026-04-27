-- 시리즈별 통합 교재 자동 생성 — DB 스키마
-- 실행: Supabase SQL Editor에서 이 파일 내용 전체 붙여넣기

-- 1) 수지님 기존 PPT 교재 자료 (시리즈별 시드)
-- 한 PPT가 여러 시리즈에 매핑될 수 있도록 (series_name, file_name) 복합 유니크
CREATE TABLE IF NOT EXISTS textbook_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  series_name TEXT NOT NULL,
  source_type TEXT DEFAULT 'pptx',
  file_name TEXT NOT NULL,
  slides JSONB,
  full_text TEXT,
  uploaded_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(series_name, file_name)
);

CREATE INDEX IF NOT EXISTS idx_textbook_sources_series ON textbook_sources(series_name);

-- 2) 시리즈 분류 캐시 (한 노트 → 여러 시리즈 가능)
CREATE TABLE IF NOT EXISTS textbook_classifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  note_id UUID REFERENCES student_notes(id) ON DELETE CASCADE,
  series_name TEXT NOT NULL,
  confidence NUMERIC,
  classified_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(note_id, series_name)
);

CREATE INDEX IF NOT EXISTS idx_textbook_classifications_series ON textbook_classifications(series_name);
CREATE INDEX IF NOT EXISTS idx_textbook_classifications_note ON textbook_classifications(note_id);

-- 3) 시리즈별 교재 챕터
CREATE TABLE IF NOT EXISTS textbook_chapters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  series_name TEXT UNIQUE NOT NULL,
  category TEXT,
  html_content TEXT,
  status TEXT DEFAULT 'draft',
  source_note_ids JSONB DEFAULT '[]',
  source_pptx_ids JSONB DEFAULT '[]',
  generated_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_textbook_chapters_status ON textbook_chapters(status);
CREATE INDEX IF NOT EXISTS idx_textbook_chapters_category ON textbook_chapters(category);

-- updated_at 자동 갱신 트리거
CREATE OR REPLACE FUNCTION update_textbook_chapters_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS textbook_chapters_updated_at ON textbook_chapters;
CREATE TRIGGER textbook_chapters_updated_at
  BEFORE UPDATE ON textbook_chapters
  FOR EACH ROW
  EXECUTE FUNCTION update_textbook_chapters_updated_at();
