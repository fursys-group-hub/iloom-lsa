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
  is_dropped BOOLEAN DEFAULT FALSE,
  dropped_at DATE,
  drop_reason TEXT,
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

-- 매장 교육관리자 (교육TF 포함)
CREATE TABLE managers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL DEFAULT '0000',
  store_name TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 주차별 평가
CREATE TABLE weekly_evaluations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID REFERENCES students(id),
  manager_id UUID REFERENCES managers(id),
  week_number INTEGER NOT NULL CHECK (week_number BETWEEN 1 AND 12),
  rp_area TEXT,
  status TEXT CHECK (status IN ('completed','not_completed','partial')) DEFAULT 'completed',
  strength_tags TEXT[] DEFAULT '{}',
  improvement_tags TEXT[] DEFAULT '{}',
  comment TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(student_id, week_number)
);

-- 벤치마킹 기록 (교육생 작성)
CREATE TABLE benchmarks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID REFERENCES students(id),
  week_number INTEGER NOT NULL CHECK (week_number BETWEEN 1 AND 12),
  target_name TEXT NOT NULL,
  target_role TEXT,
  store_name TEXT,
  learnings TEXT NOT NULL,
  action_plan TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(student_id, week_number)
);

-- 교육 총평 (관리자 작성)
CREATE TABLE final_evaluations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID REFERENCES students(id),
  manager_id UUID REFERENCES managers(id),
  overall_rating INTEGER CHECK (overall_rating BETWEEN 1 AND 5),
  summary TEXT NOT NULL,
  strengths TEXT,
  areas_to_develop TEXT,
  recommended_position TEXT,
  store_fit_score INTEGER CHECK (store_fit_score BETWEEN 1 AND 5),
  independence_score INTEGER CHECK (independence_score BETWEEN 1 AND 5),
  customer_score INTEGER CHECK (customer_score BETWEEN 1 AND 5),
  product_score INTEGER CHECK (product_score BETWEEN 1 AND 5),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(student_id, manager_id)
);

-- 교육일지 코멘트 (관리자↔교육생 대화)
CREATE TABLE note_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  note_id UUID NOT NULL REFERENCES student_notes(id) ON DELETE CASCADE,
  author_role TEXT NOT NULL CHECK (author_role IN ('admin', 'student')),
  author_name TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
