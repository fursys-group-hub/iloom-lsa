-- 교육내용정리 일괄 데이터 — 세트마스터 + 제품가이드
-- 실행: Supabase SQL Editor에서 이 파일 내용 전체 붙여넣기

-- 1) 세트마스터 (ERP 4,106행) — 시리즈별 단품코드/색상/사이즈 정확 데이터
CREATE TABLE IF NOT EXISTS textbook_set_master (
  set_code TEXT NOT NULL,
  set_color TEXT NOT NULL,
  set_name TEXT,                -- 세트명칭(한글)
  pumok_code TEXT,              -- 품목군(코드)
  pumok_name TEXT,              -- 품목군(명) 예: (일룸)침실
  series_code TEXT,             -- 시리즈(코드)
  series_name TEXT,             -- 시리즈(명) 예: 로이, 링키플러스
  channel_code TEXT,            -- 판매채널(코드)
  channel_name TEXT,            -- 판매채널(명) 예: 공용판매/온라인판매
  size_detail TEXT,             -- 규격상세 예: 904*2204*800
  uploaded_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (set_code, set_color)
);

CREATE INDEX IF NOT EXISTS idx_set_master_series ON textbook_set_master(series_name);
CREATE INDEX IF NOT EXISTS idx_set_master_pumok ON textbook_set_master(pumok_name);
CREATE INDEX IF NOT EXISTS idx_set_master_channel ON textbook_set_master(channel_name);

ALTER TABLE textbook_set_master ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all for anon" ON textbook_set_master;
CREATE POLICY "Allow all for anon" ON textbook_set_master FOR ALL USING (true) WITH CHECK (true);


-- 2) 제품가이드 5탭 캐시 — WordPress 크롤링 결과 (175개 시리즈)
CREATE TABLE IF NOT EXISTS textbook_product_guide (
  page_id INT PRIMARY KEY,           -- iloomproduct.fursys.com ?p=N
  series_name TEXT NOT NULL,         -- 카탈로그상 시리즈명
  category TEXT,                     -- 리빙룸/다이닝룸/...
  url TEXT,                          -- 원본 URL
  tab1 JSONB,                        -- 타겟·기획의도·품목
  tab2 JSONB,                        -- 규격·소재
  tab3 JSONB,                        -- 특징·주의사항·옵션
  tab4 JSONB,                        -- 추천연관제품
  tab5 JSONB,                        -- 히스토리
  full_html TEXT,                    -- 원본 HTML (디버그/재파싱용)
  fetch_status TEXT DEFAULT 'ok',    -- ok / partial / error
  fetch_error TEXT,                  -- 실패 사유
  fetched_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_product_guide_series ON textbook_product_guide(series_name);
CREATE INDEX IF NOT EXISTS idx_product_guide_category ON textbook_product_guide(category);
CREATE INDEX IF NOT EXISTS idx_product_guide_status ON textbook_product_guide(fetch_status);

ALTER TABLE textbook_product_guide ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all for anon" ON textbook_product_guide;
CREATE POLICY "Allow all for anon" ON textbook_product_guide FOR ALL USING (true) WITH CHECK (true);
