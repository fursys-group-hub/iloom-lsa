// 시리즈 1개의 4소스 데이터 한꺼번에 모으기
// - PPT: textbook_sources에서 시리즈 관련 슬라이드만
// - 일지: textbook_classifications + student_notes
// (WordPress, Notion 단종은 별도 — 외부 시스템)
//
// 사용법: node scripts/textbook/fetch-series-data.mjs 코펜하겐

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, '../../.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const seriesName = process.argv[2] || '코펜하겐';
const OUT_DIR = path.resolve(__dirname, 'output', `series-${seriesName}`);
await fs.mkdir(OUT_DIR, { recursive: true });

// ── 1) PPT에서 시리즈 관련 슬라이드 추출 ────────────────
console.log(`\n[1/2] PPT 슬라이드 추출: ${seriesName}`);
const { data: sources } = await supabase.from('textbook_sources').select('file_name, full_text');
const pptResults = [];
for (const src of sources || []) {
  const slides = (src.full_text || '').split(/(?=--- Slide \d+)/g).filter(Boolean);
  const matchedIdx = new Set();
  for (let i = 0; i < slides.length; i++) {
    if (slides[i].includes(seriesName)) {
      matchedIdx.add(i);
      if (i > 0) matchedIdx.add(i - 1);
      if (i + 1 < slides.length) matchedIdx.add(i + 1);
    }
  }
  if (matchedIdx.size > 0) {
    const matched = Array.from(matchedIdx).sort((a, b) => a - b).map((i) => slides[i]).join('\n\n');
    pptResults.push({ file: src.file_name, slide_count: matchedIdx.size, text: matched });
  }
}
console.log(`   매칭된 PPT 자료: ${pptResults.length}개 파일`);
for (const p of pptResults) console.log(`   - ${p.file}: ${p.slide_count}장 (${p.text.length}자)`);
await fs.writeFile(path.join(OUT_DIR, 'ppt.json'), JSON.stringify(pptResults, null, 2), 'utf-8');

// ── 2) 일지 가져오기 ─────────────────────────────────────
console.log(`\n[2/2] 일지 가져오기: ${seriesName}`);
const { data: classifs } = await supabase
  .from('textbook_classifications')
  .select('note_id')
  .eq('series_name', seriesName)
  .limit(500);
const noteIds = (classifs || []).map((c) => c.note_id);
console.log(`   분류된 일지: ${noteIds.length}건`);

const notes = [];
if (noteIds.length > 0) {
  const { data: rawNotes } = await supabase
    .from('student_notes')
    .select('id, content, created_at, students(name, batch_id)')
    .in('id', noteIds);

  const { data: batches } = await supabase.from('batches').select('id, name');
  const batchMap = new Map((batches || []).map((b) => [b.id, b.name]));

  for (const row of rawNotes || []) {
    let parsed = {};
    try { parsed = JSON.parse(row.content); } catch { /* */ }
    const tags = parsed?.meta?.tags || [];
    if (tags.includes('실습일지')) continue;
    const step1 = parsed?.steps?.step1 || '';
    const step2 = parsed?.steps?.step2 || '';
    const step3 = parsed?.steps?.step3 || '';
    if (!step1 && !step2 && !step3) continue;
    const d = new Date(row.created_at);
    const dateLabel = `${d.getMonth() + 1}/${d.getDate()}`;
    const batchId = row.students?.batch_id || null;
    const batchLabel = batchId ? batchMap.get(batchId) || '?' : '?';
    notes.push({
      id: row.id,
      student_name: row.students?.name || '?',
      batch_label: batchLabel,
      date: dateLabel,
      is_self_study: tags.includes('자율학습'),
      step1, step2, step3,
    });
  }
}
console.log(`   유효 일지: ${notes.length}건 (실습일지/빈노트 제외)`);
await fs.writeFile(path.join(OUT_DIR, 'notes.json'), JSON.stringify(notes, null, 2), 'utf-8');

console.log(`\n✅ 결과 저장: ${OUT_DIR}`);
console.log(`   - ppt.json: PPT 시리즈 관련 슬라이드`);
console.log(`   - notes.json: 학생 일지 ${notes.length}건`);
