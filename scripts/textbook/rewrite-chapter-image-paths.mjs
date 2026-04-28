// textbook_chapters.html_content의 /textbook-images/... 경로를 Supabase Storage URL로 일괄 치환
// 사용법: node scripts/textbook/rewrite-chapter-image-paths.mjs [--dry-run]
//
// 사전:
// 1) setup-storage.mjs 먼저 실행 → bucket + storage-key-map.json 생성
// 2) 이 스크립트가 매핑 활용해서 챕터 HTML 경로 치환

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import fs from 'fs/promises';
import path from 'path';

config({ path: '.env.local' });

const DRY = process.argv.includes('--dry-run');
const BUCKET = 'textbook-images';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// 1) 매핑 로드
const MAP_FILE = path.resolve('scripts/textbook/output/storage-key-map.json');
const keyMap = JSON.parse(await fs.readFile(MAP_FILE, 'utf-8'));
console.log(`1) 매핑 로드: ${Object.keys(keyMap).length}개`);

// 2) Supabase Storage public URL 베이스
const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, '');
const STORAGE_BASE = `${SUPA_URL}/storage/v1/object/public/${BUCKET}`;
console.log(`   Storage base: ${STORAGE_BASE}`);

// 3) 챕터 전체 조회
const { data: chapters, error } = await supabase
  .from('textbook_chapters')
  .select('id, series_name, html_content');
if (error) throw error;
console.log(`2) 챕터 ${chapters.length}건 로드`);

// 4) 각 챕터 HTML 안의 /textbook-images/... 경로 → Storage URL 치환
let updatedCount = 0;
let skipCount = 0;
let totalMatched = 0;

for (const ch of chapters) {
  const html = ch.html_content || '';
  // /textbook-images/<폴더>/<파일> 형태 매칭 (앞 슬래시 옵션, " ' ) 까지)
  const pattern = /\/?textbook-images\/([^"'\s)]+)/g;
  let newHtml = html;
  let matched = 0;
  let replaced = 0;

  newHtml = newHtml.replace(pattern, (_full, relPath) => {
    matched++;
    const mappedKey = keyMap[relPath];
    if (!mappedKey) {
      // 매핑 없으면 원본 유지 (다른 시리즈 이미지일 수 있음)
      return _full;
    }
    replaced++;
    return `${STORAGE_BASE}/${mappedKey}`;
  });

  totalMatched += matched;
  if (newHtml === html) {
    skipCount++;
    console.log(`   - ${ch.series_name}: 변경 없음 (매칭 ${matched})`);
    continue;
  }

  console.log(`   ✓ ${ch.series_name}: ${replaced}/${matched}개 경로 치환`);
  if (!DRY) {
    const { error: upErr } = await supabase
      .from('textbook_chapters')
      .update({ html_content: newHtml, updated_at: new Date().toISOString() })
      .eq('id', ch.id);
    if (upErr) {
      console.error(`     ❌ 업데이트 실패:`, upErr.message);
      continue;
    }
  }
  updatedCount++;
}

console.log(`\n${DRY ? '[DRY-RUN] ' : ''}✅ 완료: ${updatedCount}건 업데이트 / ${skipCount}건 스킵 / 총 ${totalMatched}개 경로 매칭`);

// 5) 검증 — 첫 챕터에서 결과 샘플
if (chapters[0]) {
  const { data: ch } = await supabase
    .from('textbook_chapters')
    .select('html_content')
    .eq('id', chapters[0].id)
    .maybeSingle();
  const samples = (ch?.html_content || '').match(/https?:\/\/[^"'\s)]*storage[^"'\s)]+/g) || [];
  console.log(`\n샘플 변환 결과 (${chapters[0].series_name}):`);
  samples.slice(0, 3).forEach((s) => console.log(`  ${s}`));
}
