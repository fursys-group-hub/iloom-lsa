// 모든 is_target 시리즈에 대해 sceleton 챕터 일괄 생성
// 사용법: node scripts/textbook/generate-all-chapters.mjs [--limit N] [--skip-existing]
//
// 흐름: catalog의 is_target 시리즈마다
//   1) collect-series-data 실행 (없으면)
//   2) generate-chapter 실행 → DB upsert (status='draft')
// --skip-existing: 이미 챕터 작성된 시리즈는 스킵 (final 상태나 사람이 작성한 거 보호)

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import fs from 'fs/promises';
import path from 'path';
import { execSync } from 'child_process';

config({ path: '.env.local' });

const args = process.argv.slice(2);
const LIMIT = (() => {
  const i = args.indexOf('--limit');
  return i >= 0 && args[i + 1] ? parseInt(args[i + 1]) : 0;
})();
const SKIP_EXISTING = args.includes('--skip-existing');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// 1) 카탈로그 → is_target 고유 시리즈명
const catalog = JSON.parse(await fs.readFile(path.resolve('public', 'iloom-catalog.json'), 'utf-8'));
const seriesNames = [...new Set(catalog.filter((s) => s.is_target).map((s) => s.series_name))];
console.log(`is_target 고유 시리즈: ${seriesNames.length}개`);

// 2) 기존 챕터 조회 (skip-existing 모드)
let skipSet = new Set();
if (SKIP_EXISTING) {
  const { data } = await supabase.from('textbook_chapters').select('series_name, status, html_content');
  // draft 상태이고 자동 sceleton인지(.claude-todo 박스 있는지) 판단
  // 사람이 작성한 챕터(코펜하겐 등)는 status가 draft더라도 .claude-todo 없을 수 있음
  for (const c of data || []) {
    const isAuto = (c.html_content || '').includes('.claude-todo');
    if (!isAuto) {
      // 사람이 작성한 챕터 → 스킵
      skipSet.add(c.series_name);
    }
  }
  console.log(`스킵 대상 (사람 작성): ${skipSet.size}건`);
}

let queue = seriesNames.filter((n) => !skipSet.has(n));
if (LIMIT > 0) queue = queue.slice(0, LIMIT);
console.log(`처리 대상: ${queue.length}개\n`);

const t0 = Date.now();
let okCount = 0;
let errCount = 0;

for (let i = 0; i < queue.length; i++) {
  const name = queue[i];
  const elapsed = (Date.now() - t0) / 1000;
  const avg = i > 0 ? elapsed / i : 5;
  const eta = Math.round((avg * (queue.length - i)) / 60);
  process.stdout.write(`\n[${i + 1}/${queue.length}] ${name} (ok ${okCount}, err ${errCount}, ETA ${eta}분)\n`);

  try {
    // 데이터 수집
    execSync(`node scripts/textbook/collect-series-data.mjs ${JSON.stringify(name)}`, { stdio: 'pipe' });
    // 챕터 생성
    execSync(`node scripts/textbook/generate-chapter.mjs ${JSON.stringify(name)}`, { stdio: 'pipe' });
    okCount++;
    process.stdout.write(`  ✓ ${name}\n`);
  } catch (e) {
    errCount++;
    process.stdout.write(`  ❌ ${name}: ${String(e.message || e).slice(0, 100)}\n`);
  }
}

const total = (Date.now() - t0) / 1000;
console.log(`\n\n✅ 완료: ${okCount}건 / ${errCount}건 실패 / ${(total / 60).toFixed(1)}분`);

const { count } = await supabase.from('textbook_chapters').select('*', { count: 'exact', head: true });
console.log(`DB 챕터 총합: ${count}건`);
