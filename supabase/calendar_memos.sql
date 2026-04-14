-- 교육 일정 할일 메모 테이블
CREATE TABLE calendar_memos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  date DATE NOT NULL,                    -- 날짜 (2026-04-14)
  text TEXT NOT NULL,                     -- 할일 내용
  done BOOLEAN DEFAULT false,            -- 완료 여부
  sort_order INT DEFAULT 0,              -- 정렬 순서
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 날짜별 조회 인덱스
CREATE INDEX idx_calendar_memos_date ON calendar_memos (date);

-- RLS 비활성화 (관리자 전용)
ALTER TABLE calendar_memos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for anon" ON calendar_memos FOR ALL USING (true) WITH CHECK (true);
