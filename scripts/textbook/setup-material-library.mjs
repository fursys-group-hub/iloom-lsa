// 소파 소재 노션 export → Storage materials/ 라이브러리 + lib/material-images.ts
// 사용법: node scripts/textbook/setup-material-library.mjs
//
// 입력: 기존자료/소파소재/ 폴더 (.md + image *.png)
// 결과:
//   - Storage textbook-images/materials/{색상코드}.png
//   - lib/material-images.ts: { 4L2: { url, name, brand, products, type } }

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

const SRC_DIR = path.resolve('기존자료/소파소재');
const files = await fs.readdir(SRC_DIR);
const mdFiles = files.filter((f) => f.endsWith('.md'));
console.log(`md 파일: ${mdFiles.length}개`);

const materials = {};
let okCount = 0;
let errCount = 0;

for (const md of mdFiles) {
  const content = await fs.readFile(path.join(SRC_DIR, md), 'utf-8');
  // 파일명에서 색상 코드 + 색상명 추출 (예: "4L2 블러쉬 2c71d9fd...md")
  const titleMatch = md.match(/^(\S+)\s+([^0-9]+)\s+\w+\.md$/);
  if (!titleMatch) {
    console.log(`   ⚠️ ${md}: 파싱 실패`);
    continue;
  }
  const code = titleMatch[1].trim();
  const name = titleMatch[2].trim();

  // 메타 추출
  const brandM = content.match(/브랜드:\s*(.+)/);
  const productM = content.match(/사용제품:\s*(.+)/);
  const typeM = content.match(/형태:\s*(.+)/);

  // 이미지 참조 (예: ![image.png](image%2042.png) → image 42.png)
  const imgM = content.match(/!\[[^\]]*\]\(([^)]+\.png)\)/);
  if (!imgM) {
    console.log(`   ⚠️ ${md}: 이미지 참조 없음`);
    continue;
  }
  const imgFileEncoded = imgM[1];
  const imgFile = decodeURIComponent(imgFileEncoded);
  const imgPath = path.join(SRC_DIR, imgFile);

  try {
    const buf = await fs.readFile(imgPath);
    const targetKey = `materials/${code}.png`;
    const { error } = await supabase.storage.from(BUCKET).upload(targetKey, buf, {
      contentType: 'image/png',
      upsert: true,
    });
    if (error) throw error;
    materials[code] = {
      name: name,
      url: `${STORAGE_BASE}/${targetKey}`,
      brand: brandM ? brandM[1].trim().replace(/\s*\([^)]+\)\s*/g, '') : null,
      products: productM ? productM[1].trim().replace(/\s*\(https:[^)]+\)\s*/g, '').trim() : null,
      type: typeM ? typeM[1].trim() : null,
    };
    okCount++;
    process.stdout.write(`\r${okCount} 업로드 ok / ${errCount} 실패     `);
  } catch (e) {
    errCount++;
    console.log(`\n   ❌ ${code}: ${e.message}`);
  }
}

console.log(`\n\n✅ ${okCount}건 업로드 / ${errCount}건 실패`);

// lib/material-images.ts 생성
const sortedCodes = Object.keys(materials).sort();
const tsContent = `// 소파 패브릭/가죽 소재 라이브러리 — 모든 시리즈 공유
// Supabase Storage textbook-images/materials/{코드}.png
// 자동 생성됨 (setup-material-library.mjs)

export interface MaterialInfo {
  name: string;       // 한국어 색상/소재명
  url: string;        // 칩 이미지 URL
  brand: string | null;    // 브랜드 (아크레, 알타클린 등)
  products: string | null; // 사용제품 (시리즈명)
  type: string | null;     // 형태 (플로킹, 우븐, 니팅 등)
}

export const MATERIAL_IMAGES: Record<string, MaterialInfo> = {
${sortedCodes.map((code) => `  '${code}': ${JSON.stringify(materials[code])},`).join('\n')}
};

export function getMaterial(code: string): MaterialInfo | null {
  return MATERIAL_IMAGES[code] || null;
}
`;

await fs.writeFile(path.resolve('lib/material-images.ts'), tsContent, 'utf-8');
console.log(`✅ lib/material-images.ts 생성 (${sortedCodes.length}건)`);

// 통계
const byBrand = {};
const byType = {};
for (const m of Object.values(materials)) {
  byBrand[m.brand || '?'] = (byBrand[m.brand || '?'] || 0) + 1;
  byType[m.type || '?'] = (byType[m.type || '?'] || 0) + 1;
}
console.log('\n브랜드별:');
Object.entries(byBrand).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log(`  ${k}: ${v}`));
console.log('\n형태별:');
Object.entries(byType).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log(`  ${k}: ${v}`));
