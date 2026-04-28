-- textbook_product_guide에 sub_pages 컬럼 추가
-- sub_pages: [{page_id, title, url}] 형태의 sub-품목 메타 정보
-- (예: 에디키즈 → 에디키즈 책상/책장/옷장 등 12개 sub 품목)

ALTER TABLE textbook_product_guide
  ADD COLUMN IF NOT EXISTS sub_pages JSONB DEFAULT '[]';

CREATE INDEX IF NOT EXISTS idx_product_guide_sub_count
  ON textbook_product_guide ((jsonb_array_length(sub_pages)));
