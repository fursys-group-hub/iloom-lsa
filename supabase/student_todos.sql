-- 학생 개인 할 일 테이블 (/my 홈 "오늘 할 일" 섹션)
CREATE TABLE student_todos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  date DATE NOT NULL,                    -- 언제 할 일인지 (2026-04-15)
  text TEXT NOT NULL,                    -- 할 일 내용
  done BOOLEAN DEFAULT false,            -- 완료 여부
  sort_order INT DEFAULT 0,              -- 정렬 순서
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 학생별 + 날짜별 조회 인덱스
CREATE INDEX idx_student_todos_student_date ON student_todos (student_id, date);

-- RLS 비활성화 (앱 레벨에서 관리)
ALTER TABLE student_todos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for anon" ON student_todos FOR ALL USING (true) WITH CHECK (true);
