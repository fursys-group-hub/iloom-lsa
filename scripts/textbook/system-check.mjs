// 교육내용정리 시스템 종합 점검
// 사용법: node scripts/textbook/system-check.mjs

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import fs from 'fs/promises';
import path from 'path';

config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

console.log('═══════════════════════════════════════════');
console.log('  교육내용정리 시스템 종합 점검');
console.log('═══════════════════════════════════════════\n');

// 1) 카탈로그
console.log('📋 1. 카탈로그 (public/iloom-catalog.json)');
const catalog = JSON.parse(await fs.readFile(path.resolve('public', 'iloom-catalog.json'), 'utf-8'));
const targets = catalog.filter((s) => s.is_target);
console.log(`   총 ${catalog.length}개 / is_target ${targets.length}개`);
const byCat = {};
for (const s of targets) byCat[s.category] = (byCat[s.category] || 0) + 1;
Object.entries(byCat).forEach(([k, v]) => console.log(`     ${k}: ${v}`));

// page_id 중복 (같은 page_id 다중 카드)
const pidGroups = {};
for (const s of targets) {
  if (!pidGroups[s.page_id]) pidGroups[s.page_id] = [];
  pidGroups[s.page_id].push(s.series_name);
}
const dupPids = Object.entries(pidGroups).filter(([_, names]) => names.length > 1);
console.log(`   같은 page_id 다중 카드: ${dupPids.length}건`);
for (const [pid, names] of dupPids) console.log(`     p=${pid}: ${[...new Set(names)].join(' / ')}`);

// 2) DB 테이블 row count
console.log('\n📊 2. Supabase 테이블');
const tables = [
  'textbook_chapters',
  'textbook_classifications',
  'textbook_product_guide',
  'textbook_set_master',
  'textbook_sources',
];
for (const t of tables) {
  const { count, error } = await supabase.from(t).select('*', { count: 'exact', head: true });
  console.log(error ? `   ❌ ${t}: ${error.message}` : `   ✓ ${t}: ${(count || 0).toLocaleString()}행`);
}

// 3) sub_pages 분포
console.log('\n📦 3. sub_pages (시리즈별)');
const PAGE = 1000;
const allGuides = [];
for (let from = 0; ; from += PAGE) {
  const { data } = await supabase
    .from('textbook_product_guide')
    .select('series_name, sub_pages, fetch_status')
    .range(from, from + PAGE - 1);
  if (!data || data.length === 0) break;
  allGuides.push(...data);
  if (data.length < PAGE) break;
}
const haveSub = allGuides.filter((g) => Array.isArray(g.sub_pages) && g.sub_pages.length > 0);
const totalSubs = haveSub.reduce((s, g) => s + g.sub_pages.length, 0);
console.log(`   sub 보유 시리즈: ${haveSub.length} / 총 sub 페이지: ${totalSubs}`);
const errStatus = allGuides.filter((g) => g.fetch_status === 'error');
console.log(`   fetch_status='error': ${errStatus.length}건`);

// 4) 분류된 일지
console.log('\n📝 4. 분류 결과 (textbook_classifications)');
const classifByName = {};
for (let from = 0; ; from += PAGE) {
  const { data } = await supabase
    .from('textbook_classifications')
    .select('series_name')
    .range(from, from + PAGE - 1);
  if (!data || data.length === 0) break;
  for (const r of data) classifByName[r.series_name] = (classifByName[r.series_name] || 0) + 1;
  if (data.length < PAGE) break;
}
const totalClassif = Object.values(classifByName).reduce((s, n) => s + n, 0);
console.log(`   총 분류 (노트, 시리즈) 쌍: ${totalClassif.toLocaleString()}`);
console.log(`   고유 시리즈명: ${Object.keys(classifByName).length}`);
const top10 = Object.entries(classifByName).sort((a, b) => b[1] - a[1]).slice(0, 10);
console.log(`   Top 10 시리즈 (일지 많은 순):`);
top10.forEach(([k, v]) => console.log(`     ${k}: ${v}`));

// 5) 카탈로그-분류 정합성 (분류 결과 시리즈명이 카탈로그에 있는지)
console.log('\n🔗 5. 카탈로그 ↔ 분류 정합성');
// SERIES_ALIASES (lib/series-aliases.ts와 동일하게 유지)
const SERIES_ALIASES_LOCAL = {
  '글렌 라이브러리': ['글렌'],
  '케플러클래식': ['케플러 클래식'],
  '엘바 패밀리': ['엘바패밀리'],
  '업 모션': ['업모션'],
  '캐빈R': ['캐빈'],
  '멘디R': ['멘디'],
  '뉴트': ['뉴트 홈오피스'],
  '버튼': ['버튼스위블'],
};
const catalogNames = new Set(targets.map((s) => s.series_name));
// 슬래시 묶음 + 별칭 매핑도 추가
for (const s of targets) {
  for (const alias of s.series_name.split('/').map((x) => x.trim())) {
    if (alias) catalogNames.add(alias);
  }
  for (const alias of SERIES_ALIASES_LOCAL[s.series_name] || []) {
    catalogNames.add(alias);
  }
}
const orphanClassif = Object.keys(classifByName).filter((name) => !catalogNames.has(name));
console.log(`   분류 결과에 있지만 카탈로그에 없는 시리즈: ${orphanClassif.length}건`);
if (orphanClassif.length > 0 && orphanClassif.length <= 15) {
  orphanClassif.forEach((n) => console.log(`     ${n} (${classifByName[n]}건)`));
} else if (orphanClassif.length > 15) {
  orphanClassif.slice(0, 15).forEach((n) => console.log(`     ${n} (${classifByName[n]}건)`));
  console.log(`     ... 외 ${orphanClassif.length - 15}건`);
}

// 6) 챕터 작성 현황
console.log('\n📚 6. 챕터 작성 현황 (textbook_chapters)');
const { data: chapters } = await supabase.from('textbook_chapters').select('series_name, status, html_content, updated_at');
console.log(`   작성된 챕터: ${chapters?.length || 0}개`);
for (const ch of chapters || []) {
  const len = (ch.html_content || '').length;
  // 이미지 경로 점검
  const localPaths = (ch.html_content || '').match(/(?:src|href)\s*=\s*"\/textbook-images\/[^"]+/g) || [];
  const storagePaths = (ch.html_content || '').match(/(?:src|href)\s*=\s*"https?:\/\/[^"]*storage\/v1\/object\/public\/textbook-images\/[^"]+/g) || [];
  console.log(`   - ${ch.series_name} [${ch.status}] ${(len / 1024).toFixed(1)}KB / 로컬경로 ${localPaths.length} / Storage URL ${storagePaths.length}`);
}

// 7) Storage bucket
console.log('\n💾 7. Supabase Storage');
const { data: buckets } = await supabase.storage.listBuckets();
const tbBucket = (buckets || []).find((b) => b.name === 'textbook-images');
console.log(tbBucket ? `   ✓ bucket 'textbook-images' 존재 (public=${tbBucket.public})` : `   ❌ bucket 'textbook-images' 없음`);

// bucket 안 파일 수 세기 (top-level prefix별)
if (tbBucket) {
  const { data: files } = await supabase.storage.from('textbook-images').list('', { limit: 1000 });
  console.log(`   루트 항목: ${files?.length || 0}개`);
  for (const f of (files || []).slice(0, 5)) {
    if (!f.id) {
      // 폴더 (prefix)
      const { data: subFiles } = await supabase.storage.from('textbook-images').list(f.name, { limit: 200 });
      console.log(`     📁 ${f.name}/  ${subFiles?.length || 0}개 파일`);
    }
  }
}

// 8) 우선순위 시리즈 일지 수 (다음 챕터 작성용)
console.log('\n🎯 8. 우선순위 시리즈 (일지 풍부 순)');
const priorityList = ['로이', '뉴트', '링키플러스', '에디', '에디키즈', '팅클팝', '쿠시노', '모드', '글렌', '링고아이'];
for (const name of priorityList) {
  const cnt = classifByName[name] || 0;
  const inCatalog = catalogNames.has(name);
  const hasChapter = (chapters || []).some((c) => c.series_name === name);
  const guide = allGuides.find((g) => g.series_name === name);
  const subCount = guide && Array.isArray(guide.sub_pages) ? guide.sub_pages.length : 0;
  console.log(`   ${name.padEnd(8)} 일지 ${String(cnt).padStart(3)} / 카탈로그 ${inCatalog ? '✓' : '✗'} / 챕터 ${hasChapter ? '✓' : '✗'} / sub ${subCount}`);
}

console.log('\n═══════════════════════════════════════════');
console.log('  점검 완료');
console.log('═══════════════════════════════════════════');
