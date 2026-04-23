-- 일룸 LSA 교육 관리 대시보드 — DB 스키마
-- Supabase SQL Editor에서 실행하세요

-- 교육 기수
CREATE TABLE batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  sheet_id TEXT,
  subject_columns JSONB NOT NULL DEFAULT '{}',
  advanced_start DATE,
  advanced_end DATE,
  advanced_sheet_id TEXT,
  advanced_pass_score INTEGER DEFAULT 80
);

-- 교육생
CREATE TABLE students (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID REFERENCES batches(id),
  name TEXT NOT NULL,
  department TEXT,
  password TEXT DEFAULT '0000',
  email TEXT,
  phone TEXT,
  company_email TEXT,
  store_location TEXT,
  photo_url TEXT,                    -- 프로필 사진 URL (Supabase Storage)
  birth_date DATE,                   -- 생년월일
  education TEXT,                    -- 학력 (예: "한양대 경영학과")
  experience TEXT,                   -- 경력 요약 (예: "가구 영업 2년")
  is_dropped BOOLEAN DEFAULT FALSE,
  dropped_at DATE,
  drop_reason TEXT,
  UNIQUE(batch_id, name)
);

-- 시험 점수 (입문교육)
CREATE TABLE test_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID REFERENCES students(id),
  test_date DATE NOT NULL,
  subject TEXT NOT NULL,
  score NUMERIC(5,2) NOT NULL,
  max_score NUMERIC(5,2) DEFAULT 100,
  UNIQUE(student_id, test_date, subject)
);

-- 심화교육 시험 점수 (재시험 여러 회차 지원)
CREATE TABLE advanced_test_scores (
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

CREATE INDEX idx_advanced_scores_lookup
  ON advanced_test_scores(student_id, week_number, submitted_at);

-- 심화교육 문제은행
CREATE TABLE advanced_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID REFERENCES batches(id) ON DELETE CASCADE,
  week_number INTEGER NOT NULL CHECK (week_number BETWEEN 1 AND 12),
  session INTEGER NOT NULL DEFAULT 1,
  question_id TEXT NOT NULL,
  question_text TEXT NOT NULL DEFAULT '',
  correct_answer TEXT DEFAULT '',
  scoring_mode TEXT DEFAULT '',
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

CREATE INDEX idx_advanced_questions_lookup
  ON advanced_questions(batch_id, week_number, session);

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

-- AI 코칭 리포트
CREATE TABLE coaching_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID REFERENCES students(id),
  test_date DATE NOT NULL,
  student_message TEXT NOT NULL DEFAULT '',
  manager_report TEXT NOT NULL,
  tag_tracking JSONB,
  report_type TEXT DEFAULT 'daily',
  report_group_id TEXT,
  subject TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(student_id, test_date, report_type)
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

-- 문제은행
CREATE TABLE questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID REFERENCES batches(id),
  session TEXT NOT NULL,
  question_id TEXT NOT NULL,
  question_text TEXT NOT NULL,
  correct_answer TEXT NOT NULL,
  scoring_mode TEXT,
  max_score NUMERIC(5,2) DEFAULT 1,
  category TEXT,
  series TEXT,
  detail TEXT,
  explanation TEXT,
  image_url TEXT,
  options TEXT,
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(batch_id, session, question_id)
);

-- 학생별 문항 응답
CREATE TABLE test_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID REFERENCES students(id),
  batch_id UUID REFERENCES batches(id),
  session TEXT NOT NULL,
  question_id TEXT NOT NULL,
  test_date DATE NOT NULL,
  user_answer TEXT,
  is_correct BOOLEAN NOT NULL,
  earned_score NUMERIC(5,2) DEFAULT 0,
  max_score NUMERIC(5,2) DEFAULT 1,
  scoring_mode TEXT,
  submitted_at TEXT,
  UNIQUE(student_id, session, question_id, test_date)
);

-- 공지사항 (관리자 → 기수별)
CREATE TABLE announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID REFERENCES batches(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  priority TEXT CHECK (priority IN ('normal', 'important', 'urgent')) DEFAULT 'normal',
  created_at TIMESTAMPTZ DEFAULT now()
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

-- 학생 질문 (질문하기 스레드)
CREATE TABLE student_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  status TEXT CHECK (status IN ('open', 'answered', 'resolved')) DEFAULT 'open',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 질문 답글 (관리자↔교육생)
CREATE TABLE question_replies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id UUID NOT NULL REFERENCES student_questions(id) ON DELETE CASCADE,
  author_role TEXT NOT NULL CHECK (author_role IN ('admin', 'student')),
  author_name TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 교육 설문 (자기효능감 + 만족도, 사전-사후 2회)
CREATE TABLE education_surveys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES batches(id),
  student_id UUID NOT NULL REFERENCES students(id),
  phase TEXT NOT NULL CHECK (phase IN ('intro_end', 'advanced_end')),
  -- 파트 A: 자기효능감 (1~5)
  eff_product INTEGER CHECK (eff_product BETWEEN 1 AND 5),
  eff_customer INTEGER CHECK (eff_customer BETWEEN 1 AND 5),
  eff_sales INTEGER CHECK (eff_sales BETWEEN 1 AND 5),
  eff_teamwork INTEGER CHECK (eff_teamwork BETWEEN 1 AND 5),
  eff_overall INTEGER CHECK (eff_overall BETWEEN 1 AND 5),
  -- 파트 B: 교육 만족도 (1~5)
  sat_content INTEGER CHECK (sat_content BETWEEN 1 AND 5),
  sat_method INTEGER CHECK (sat_method BETWEEN 1 AND 5),
  sat_duration INTEGER CHECK (sat_duration BETWEEN 1 AND 5),
  -- 파트 C: 주관식
  open_strength TEXT,
  open_worry TEXT,
  open_goal TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(batch_id, student_id, phase)
);

-- 심화교육 주간 수주 실적 (엑셀 업로드)
CREATE TABLE weekly_sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES batches(id),
  student_id UUID NOT NULL REFERENCES students(id),
  week INTEGER NOT NULL CHECK (week BETWEEN 1 AND 12),
  consult INTEGER DEFAULT 0,
  estimate INTEGER DEFAULT 0,
  orders INTEGER DEFAULT 0,
  amount INTEGER DEFAULT 0,
  categories TEXT[],
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(batch_id, student_id, week)
);
