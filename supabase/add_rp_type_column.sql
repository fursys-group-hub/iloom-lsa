-- weekly_evaluations 테이블에 rp_type 컬럼 추가
-- 코드(app/api/evaluations/route.ts, app/manager/evaluations/page.tsx)는 이미 rp_type을 사용 중이지만
-- DB에 컬럼이 없어서 "Could not find the 'rp_type' column" 에러 발생.
-- Supabase SQL Editor에서 1회 실행하면 됨.

ALTER TABLE weekly_evaluations
  ADD COLUMN IF NOT EXISTS rp_type TEXT;

-- Supabase PostgREST 스키마 캐시 갱신 (간혹 자동 갱신 안 될 때)
NOTIFY pgrst, 'reload schema';
