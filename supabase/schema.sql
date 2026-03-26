-- 일룸 LSA 교육 관리 대시보드 — DB 스키마
-- Supabase SQL Editor에서 실행하세요

-- 교육 기수
CREATE TABLE batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  sheet_id TEXT,
  subject_columns JSONB NOT NULL DEFAULT '{}'
);

-- 교육생
CREATE TABLE students (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID REFERENCES batches(id),
  name TEXT NOT NULL,
  department TEXT,
  UNIQUE(batch_id, name)
);

-- 시험 점수
CREATE TABLE test_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID REFERENCES students(id),
  test_date DATE NOT NULL,
  subject TEXT NOT NULL,
  score NUMERIC(5,2) NOT NULL,
  max_score NUMERIC(5,2) DEFAULT 100,
  UNIQUE(student_id, test_date, subject)
);

-- 출결
CREATE TABLE attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID REFERENCES students(id),
  date DATE NOT NULL,
  status TEXT CHECK (status IN ('present','late','early_leave','absent')),
  note TEXT,
  UNIQUE(student_id, date)
);

-- 교육자 메모
CREATE TABLE student_memos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID REFERENCES students(id),
  date DATE NOT NULL,
  content TEXT NOT NULL,
  category TEXT DEFAULT 'general'
);

-- 오답 기록
CREATE TABLE wrong_answers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID REFERENCES students(id),
  test_date DATE NOT NULL,
  subject TEXT NOT NULL,
  question_summary TEXT,
  tags TEXT[] NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- AI 코칭 리포트
CREATE TABLE coaching_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID REFERENCES students(id),
  test_date DATE NOT NULL,
  student_message TEXT NOT NULL,
  manager_report TEXT NOT NULL,
  tag_tracking JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(student_id, test_date)
);

-- 학생 교육 노트
CREATE TABLE student_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID REFERENCES students(id),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
