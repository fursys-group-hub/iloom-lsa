// 단일 시리즈의 모든 데이터를 통합 수집 → JSON 한 파일로 저장
// 사용법: node scripts/textbook/collect-series-data.mjs <시리즈명>
// 예: node scripts/textbook/collect-series-data.mjs 로이
//
// 수집 소스 (4개):
// 1. 카탈로그 (public/iloom-catalog.json) — page_id, category, pumok, gubun
// 2. textbook_product_guide — 5탭 본문/표/이미지 + sub_pages
// 3. textbook_set_master — 시리즈명 매칭 단품들 (단품코드/색상/사이즈/채널)
// 4. textbook_classifications + student_notes — 분류된 일지 본문

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import fs from 'fs/promises';
import path from 'path';

config({ path: '.env.local' });

const seriesName = process.argv[2];
if (!seriesName) {
  console.error('사용법: node scripts/textbook/collect-series-data.mjs <시리즈명>');
  process.exit(1);
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const OUT_DIR = path.resolve('scripts/textbook/output', `series-${seriesName}`);
await fs.mkdir(OUT_DIR, { recursive: true });

console.log(`\n═══ '${seriesName}' 데이터 수집 시작 ═══\n`);

// ─── 1) 카탈로그 ───
console.log('1) 카탈로그 검색...');
const catalog = JSON.parse(await fs.readFile(path.resolve('public', 'iloom-catalog.json'), 'utf-8'));
const cards = catalog.filter((s) => s.series_name === seriesName);
const aliases = (await fs.readFile(path.resolve('lib', 'series-aliases.ts'), 'utf-8'))
  .match(/'([^']+)':\s*\['([^']+)'\]/g) || [];
let aliasNames = [seriesName];
for (const a of aliases) {
  const m = a.match(/'([^']+)':\s*\['([^']+)'\]/);
  if (m && m[1] === seriesName) aliasNames.push(m[2]);
}
console.log(`   카드 ${cards.length}개 / 분류 별칭 ${aliasNames.join(', ')}`);
cards.forEach((c) => console.log(`     [${c.category}] ${c.pumok}${c.gubun ? '/' + c.gubun : ''} (p=${c.page_id})`));

const pageIds = [...new Set(cards.map((c) => c.page_id))];

// ─── 2) 제품가이드 (5탭 + sub_pages) ───
console.log('\n2) 제품가이드 (textbook_product_guide)...');
const guides = [];
for (const pid of pageIds) {
  const { data } = await supabase.from('textbook_product_guide').select('*').eq('page_id', pid).maybeSingle();
  if (data) guides.push(data);
}
const totalSubs = guides.reduce((s, g) => s + (g.sub_pages?.length || 0), 0);
const totalTabTextLen = guides.reduce((s, g) => {
  return s + ['tab1','tab2','tab3','tab4','tab5'].reduce((a, t) => a + (g[t]?.text?.length || 0), 0);
}, 0);
console.log(`   ${guides.length}개 페이지 / sub-품목 ${totalSubs}개 / 총 텍스트 ${totalTabTextLen.toLocaleString()}자`);

// ─── 3) 세트마스터 (단품 정보) ───
console.log('\n3) 세트마스터 (textbook_set_master)...');
const PAGE = 1000;
const allSets = [];
for (let from = 0; ; from += PAGE) {
  const { data } = await supabase
    .from('textbook_set_master')
    .select('*')
    .in('series_name', aliasNames)
    .range(from, from + PAGE - 1);
  if (!data || data.length === 0) break;
  allSets.push(...data);
  if (data.length < PAGE) break;
}
console.log(`   ${allSets.length}개 단품 (시리즈명 + 별칭 기준)`);
const setsByPumok = {};
for (const s of allSets) {
  setsByPumok[s.pumok_name] = (setsByPumok[s.pumok_name] || 0) + 1;
}
Object.entries(setsByPumok).forEach(([k, v]) => console.log(`     ${k}: ${v}`));

// ─── 4) 학생 일지 (분류 + 본문) ───
console.log('\n4) 학생 일지 (textbook_classifications + student_notes)...');
const { data: classifs } = await supabase
  .from('textbook_classifications')
  .select('note_id, series_name, confidence')
  .in('series_name', aliasNames);
const noteIds = [...new Set((classifs || []).map((c) => c.note_id))];
console.log(`   분류된 일지 ${noteIds.length}건 (series_name 매칭: ${classifs?.length || 0}건)`);

const notes = [];
for (let i = 0; i < noteIds.length; i += 100) {
  const batch = noteIds.slice(i, i + 100);
  const { data } = await supabase
    .from('student_notes')
    .select('id, content, created_at, students!inner(name, batch_id)')
    .in('id', batch);
  notes.push(...(data || []));
}
console.log(`   본문 fetch: ${notes.length}건`);

// 기수 매핑
const { data: batches } = await supabase.from('batches').select('id, name');
const batchMap = new Map((batches || []).map((b) => [b.id, b.name]));

// 일지 unpacking (steps/blocks/text 처리 + 시리즈 관련 부분만 추출)
function unpackNote(row) {
  const studentName = row.students?.name;
  const batchName = batchMap.get(row.students?.batch_id) || '?';
  let parsed = null;
  try { parsed = JSON.parse(row.content); } catch {}
  const tags = parsed?.meta?.tags || [];
  if (tags.includes('실습일지')) return null;
  const text = [
    parsed?.steps?.step1,
    parsed?.steps?.step2,
    parsed?.steps?.step3,
    parsed?.text,
  ].filter(Boolean).join('\n').trim();
  if (!text && !parsed?.blocks) return null;
  // 시리즈명 별칭 주변 발췌 (앞 30자 + 매칭 + 뒤 200자)
  const excerpts = [];
  for (const alias of aliasNames) {
    let idx = -1;
    let lastIdx = 0;
    while ((idx = text.indexOf(alias, lastIdx)) !== -1) {
      excerpts.push(text.slice(Math.max(0, idx - 30), idx + alias.length + 200));
      lastIdx = idx + alias.length;
    }
  }
  return {
    id: row.id,
    student: studentName,
    batch: batchName,
    date: row.created_at?.slice(0, 10),
    full_text: text,
    excerpts: excerpts.slice(0, 3),
  };
}
const notesData = notes.map(unpackNote).filter(Boolean);

// ─── 5) PPTX 슬라이드 발췌 ───
console.log('\n5) PPTX 슬라이드 발췌 (textbook_sources)...');
const { data: sources } = await supabase
  .from('textbook_sources')
  .select('file_name, slides');
const pptxSlides = [];
for (const src of sources || []) {
  const slides = Array.isArray(src.slides) ? src.slides : [];
  for (const slide of slides) {
    const text = String(slide.text || '');
    // 시리즈명 또는 별칭이 슬라이드 텍스트에 등장하면 포함
    const hit = aliasNames.some((alias) => text.includes(alias));
    if (hit) {
      pptxSlides.push({
        file: src.file_name,
        slide_no: slide.slide_no,
        title: slide.title,
        text: text.slice(0, 1500), // 슬라이드당 최대 1500자
      });
    }
  }
}
console.log(`   ${pptxSlides.length}개 슬라이드 매칭 (전체 PPTX에서 시리즈명 등장 슬라이드)`);
const byFile = {};
for (const s of pptxSlides) byFile[s.file] = (byFile[s.file] || 0) + 1;
Object.entries(byFile).forEach(([k, v]) => console.log(`     ${k}: ${v}장`));

// ─── 결과 저장 ───
const result = {
  series_name: seriesName,
  aliases: aliasNames,
  catalog_cards: cards,
  product_guides: guides,
  set_master: allSets,
  set_master_by_pumok: setsByPumok,
  notes_count: notesData.length,
  notes: notesData,
  pptx_slides: pptxSlides,
  collected_at: new Date().toISOString(),
};

const outFile = path.join(OUT_DIR, 'all-data.json');
await fs.writeFile(outFile, JSON.stringify(result, null, 2), 'utf-8');

const sizeKB = (Buffer.byteLength(JSON.stringify(result)) / 1024).toFixed(1);
console.log(`\n✅ 저장: ${outFile} (${sizeKB}KB)`);

// ─── 요약 ───
console.log('\n═══ 요약 ═══');
console.log(`  카탈로그 카드: ${cards.length}개 (${[...new Set(cards.map((c) => c.category))].join(', ')})`);
console.log(`  제품가이드 페이지: ${guides.length}개 / sub-품목 ${totalSubs}개`);
console.log(`  세트마스터 단품: ${allSets.length}개`);
console.log(`  분류된 일지: ${notesData.length}건 (전체 ${notes.length}건 중)`);
console.log(`  PPTX 매칭 슬라이드: ${pptxSlides.length}장`);
console.log(`\n다음 단계: 이 JSON으로 챕터 HTML 자동 생성 (코펜하겐 템플릿 따라)`);
