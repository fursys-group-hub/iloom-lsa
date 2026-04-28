// 세트마스터 엑셀 → Supabase textbook_set_master 테이블 업로드
// 사용법: node scripts/textbook/upload-set-master.mjs
// 사전: supabase/textbook-bulk.sql 을 SQL Editor에서 한 번 실행해서 테이블 생성

import XLSX from 'xlsx';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const FILE = path.resolve('기존자료', '일룸 세트마스터목록 수파베이스 업로드.xlsx');

console.log('1) 엑셀 읽는 중:', FILE);
const workbook = XLSX.readFile(FILE);
const sheet = workbook.Sheets['Sheet1'];
const json = XLSX.utils.sheet_to_json(sheet, { defval: '' });
console.log(`   → ${json.length}행`);

// 한국어 컬럼명 → DB 컬럼명 매핑
const rows = json.map(r => ({
  set_code:     String(r['세트코드'] || '').trim(),
  set_color:    String(r['세트색상'] || '').trim(),
  set_name:     String(r['세트명칭(한글)'] || '').trim() || null,
  pumok_code:   String(r['품목군(코드)'] || '').trim() || null,
  pumok_name:   String(r['품목군(명)'] || '').trim() || null,
  series_code:  String(r['시리즈(코드)'] || '').trim() || null,
  series_name:  String(r['시리즈(명)'] || '').trim() || null,
  channel_code: String(r['판매채널(코드)'] || '').trim() || null,
  channel_name: String(r['판매채널(명)'] || '').trim() || null,
  size_detail:  String(r['규격상세'] || '').trim() || null,
}))
.filter(r => r.set_code && r.set_color); // PK 비어있으면 제외

console.log(`2) 유효 행 ${rows.length}개 (PK 누락 제외 ${json.length - rows.length}개)`);

// 기존 데이터 비우기 (재실행 안전성)
console.log('3) 기존 데이터 삭제 중...');
const { error: delErr } = await supabase.from('textbook_set_master').delete().neq('set_code', '');
if (delErr && !delErr.message.includes('No rows')) console.log('   삭제 경고:', delErr.message);

// 1000개씩 배치 INSERT
const BATCH = 1000;
let inserted = 0;
const t0 = Date.now();
for (let i = 0; i < rows.length; i += BATCH) {
  const batch = rows.slice(i, i + BATCH);
  const { error } = await supabase.from('textbook_set_master').insert(batch);
  if (error) {
    console.error(`   ❌ batch ${i}~${i+batch.length-1} 실패:`, error.message);
    process.exit(1);
  }
  inserted += batch.length;
  process.stdout.write(`\r4) 업로드 중... ${inserted}/${rows.length} (${Math.round(inserted/rows.length*100)}%)`);
}

console.log(`\n✅ 완료: ${inserted}행 / ${((Date.now()-t0)/1000).toFixed(1)}초`);

// 검증
const { count } = await supabase.from('textbook_set_master').select('*', { count: 'exact', head: true });
console.log(`5) DB 확인: ${count}행 저장됨`);

// 시리즈별 행 수 확인 (일부)
const { data: top } = await supabase
  .from('textbook_set_master')
  .select('series_name')
  .not('series_name', 'is', null);
const counts = {};
for (const r of top || []) counts[r.series_name] = (counts[r.series_name]||0)+1;
const sorted = Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,10);
console.log('\n시리즈별 Top 10 (DB):');
sorted.forEach(([k,v])=>console.log(`  ${k}: ${v}`));
