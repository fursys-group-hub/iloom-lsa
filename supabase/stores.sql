-- 배치 매장 목록 테이블
CREATE TABLE stores (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,             -- 매장명 (예: 노원점, 논현점)
  sort_order INT DEFAULT 0,              -- 정렬 순서
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 이름 유니크 인덱스 (UNIQUE 제약으로 자동 생성되지만 명시)
CREATE INDEX idx_stores_sort ON stores (sort_order, name);

-- RLS (관리자 전용)
ALTER TABLE stores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for anon" ON stores FOR ALL USING (true) WITH CHECK (true);
