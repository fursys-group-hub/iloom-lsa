// 색상 코드별 칩 이미지를 Storage colors/ 폴더에 통합 라이브러리로 구축
// 한 번 등록한 색상 칩은 모든 시리즈가 공유 (중복 업로드 방지)
//
// 사용법:
//   node scripts/textbook/setup-color-library.mjs add <코드> <소스 storage_key>
//   node scripts/textbook/setup-color-library.mjs list
//
// 예: node scripts/textbook/setup-color-library.mjs add SP p15137/04_243x243_tab1.jpg
//     → colors/SP.jpg 생성

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import fs from 'fs/promises';
import path from 'path';

config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const BUCKET = 'textbook-images';
const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, '');
const STORAGE_BASE = `${SUPA_URL}/storage/v1/object/public/${BUCKET}`;

const args = process.argv.slice(2);
const cmd = args[0];

if (cmd === 'add' && args[1] && args[2]) {
  const code = args[1].toUpperCase();
  const sourceKey = args[2];
  const ext = path.extname(sourceKey);
  const targetKey = `colors/${code}${ext}`;

  const { error } = await supabase.storage.from(BUCKET).copy(sourceKey, targetKey);
  if (error) {
    // 이미 존재하면 upsert
    if (error.message.includes('already exists')) {
      const { data: file } = await supabase.storage.from(BUCKET).download(sourceKey);
      if (file) {
        const buf = Buffer.from(await file.arrayBuffer());
        await supabase.storage.from(BUCKET).update(targetKey, buf);
        console.log(`✅ ${code}: ${targetKey} (덮어쓰기)`);
      }
    } else {
      console.error('❌', error.message);
      process.exit(1);
    }
  } else {
    console.log(`✅ ${code}: ${targetKey}`);
  }
  console.log(`   URL: ${STORAGE_BASE}/${targetKey}`);

  // lib/color-chips.ts 갱신
  const libFile = path.resolve('lib/color-chips.ts');
  let libContent;
  try {
    libContent = await fs.readFile(libFile, 'utf-8');
  } catch {
    libContent = `// 색상 코드별 통합 칩 이미지 라이브러리 (Supabase Storage colors/)
// 모든 시리즈가 공유 — 중복 업로드 방지
export const COLOR_CHIP_BASE = '${STORAGE_BASE}/colors';
export const COLOR_CHIPS: Record<string, string> = {
};

export function getColorChip(code: string): string | null {
  return COLOR_CHIPS[code] || null;
}
`;
  }
  // 매핑 추가/갱신
  const newEntry = `  ${code}: '${STORAGE_BASE}/${targetKey}',`;
  const re = new RegExp(`\\s*${code}:\\s*'[^']*',?\\n`);
  if (re.test(libContent)) {
    libContent = libContent.replace(re, `\n${newEntry}\n`);
  } else {
    libContent = libContent.replace(/(COLOR_CHIPS: Record<string, string> = \{)/, `$1\n${newEntry}`);
  }
  await fs.writeFile(libFile, libContent, 'utf-8');
  console.log(`   lib/color-chips.ts 갱신`);
} else if (cmd === 'list') {
  const { data: files } = await supabase.storage.from(BUCKET).list('colors', { limit: 100 });
  console.log('colors/ 폴더 파일:');
  for (const f of files || []) {
    console.log(`  ${f.name} → ${STORAGE_BASE}/colors/${f.name}`);
  }
} else {
  console.log(`사용법:
  node scripts/textbook/setup-color-library.mjs add <코드> <소스 storage_key>
    예: node scripts/textbook/setup-color-library.mjs add SP p15137/04_243x243_tab1.jpg
  node scripts/textbook/setup-color-library.mjs list`);
}
