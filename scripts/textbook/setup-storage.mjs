// Supabase Storage 셋업 — bucket 'textbook-images' 생성 + 이미지 업로드
// 사용법: node scripts/textbook/setup-storage.mjs
//   --upload-only : bucket 생성 스킵, 업로드만
//   --dir <path>  : 업로드할 로컬 디렉토리 (기본: public/textbook-images)
//
// 키 변환 규칙 (Supabase Storage ASCII 키 제약):
//   폴더 시리즈명(한글) → 'p<page_id>' (예: 코펜하겐 → p21977)
//   파일명 한글 제거 (예: 4L0_샤모아.png → 4L0.png)
// 변환 매핑은 scripts/textbook/output/storage-key-map.json에 저장 →
// 챕터 HTML 경로 치환 스크립트에서 재활용
//
// 멱등 — 여러 번 실행해도 안전 (upsert 모드)

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import fs from 'fs/promises';
import path from 'path';

config({ path: '.env.local' });

const args = process.argv.slice(2);
const UPLOAD_ONLY = args.includes('--upload-only');
const DIR_IDX = args.indexOf('--dir');
const LOCAL_DIR = path.resolve(DIR_IDX >= 0 ? args[DIR_IDX + 1] : 'public/textbook-images');

const BUCKET = 'textbook-images';

// 카탈로그 로드 → 시리즈명 → page_id 매핑
const catalog = JSON.parse(await fs.readFile(path.resolve('public', 'iloom-catalog.json'), 'utf-8'));
const seriesToPid = new Map();
for (const s of catalog) {
  if (!seriesToPid.has(s.series_name)) seriesToPid.set(s.series_name, s.page_id);
}

function sanitizeFilename(name) {
  const ext = path.extname(name);
  const base = path.basename(name, ext);
  // 영문/숫자/언더스코어/하이픈/점만 남김 + 양 끝 _ 정리
  const clean = base.replace(/[^A-Za-z0-9_.\-]/g, '').replace(/_+$/, '').replace(/^_+/, '') || 'unnamed';
  return clean + ext.toLowerCase();
}

function toStorageKey(relPath) {
  // 'coepenh/01.png' 같은 슬래시 구분 키
  const parts = relPath.split('/');
  const folder = parts[0];
  const rest = parts.slice(1).map(sanitizeFilename).join('/');
  const pid = seriesToPid.get(folder);
  if (!pid) {
    // 매핑 없으면 폴더명도 sanitize (영문 폴더는 그대로)
    const safeFolder = sanitizeFilename(folder).replace(/\.[^.]+$/, ''); // 확장자 제거 (디렉토리는 ext 없음)
    return `${safeFolder}/${rest}`;
  }
  return `p${pid}/${rest}`;
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// 1) bucket 생성 (없으면)
if (!UPLOAD_ONLY) {
  console.log('1) bucket 확인/생성 중...');
  const { data: buckets } = await supabase.storage.listBuckets();
  const exists = (buckets || []).some((b) => b.name === BUCKET);

  if (exists) {
    console.log(`   ✓ '${BUCKET}' 이미 존재`);
  } else {
    const { error } = await supabase.storage.createBucket(BUCKET, {
      public: true,
      fileSizeLimit: 10 * 1024 * 1024, // 10MB / 파일
      allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'],
    });
    if (error) {
      console.error('   ❌ bucket 생성 실패:', error.message);
      process.exit(1);
    }
    console.log(`   ✓ '${BUCKET}' 새로 생성 (public)`);
  }
}

// 2) 로컬 디렉토리 재귀 스캔
async function* walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(full);
    else yield full;
  }
}

console.log(`2) 로컬 스캔: ${LOCAL_DIR}`);
const files = [];
const keyMap = {}; // {원본 rel: storage key} — 챕터 HTML 경로 치환 시 활용
try {
  for await (const f of walk(LOCAL_DIR)) {
    const rel = path.relative(LOCAL_DIR, f).split(path.sep).join('/');
    const storageKey = toStorageKey(rel);
    files.push({ local: f, key: storageKey, originalRel: rel });
    keyMap[rel] = storageKey;
  }
} catch (e) {
  console.error('   ❌ 디렉토리 읽기 실패:', e.message);
  process.exit(1);
}
console.log(`   → ${files.length}개 파일 발견`);

// 키 매핑 저장 — 챕터 HTML 경로 치환 시 재활용
const MAP_FILE = path.resolve('scripts/textbook/output/storage-key-map.json');
await fs.mkdir(path.dirname(MAP_FILE), { recursive: true });
await fs.writeFile(MAP_FILE, JSON.stringify(keyMap, null, 2), 'utf-8');
console.log(`   → 키 매핑 저장: ${MAP_FILE}`);

// 매핑 샘플 출력
const sampleKeys = Object.entries(keyMap).slice(0, 5);
console.log(`   매핑 샘플:`);
for (const [orig, key] of sampleKeys) {
  console.log(`     ${orig} → ${key}`);
}

// 3) 업로드 (배치, 동시성 제한)
console.log('3) Storage 업로드 중 (upsert)...');
const t0 = Date.now();
let okCount = 0;
let errCount = 0;
const CONCURRENCY = 6;

async function uploadOne({ local, key }) {
  const buf = await fs.readFile(local);
  const ext = path.extname(local).toLowerCase();
  const ct = ext === '.png' ? 'image/png' : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : ext === '.webp' ? 'image/webp' : 'application/octet-stream';
  const { error } = await supabase.storage.from(BUCKET).upload(key, buf, {
    contentType: ct,
    upsert: true,
  });
  if (error) throw error;
}

for (let i = 0; i < files.length; i += CONCURRENCY) {
  const batch = files.slice(i, i + CONCURRENCY);
  const results = await Promise.allSettled(batch.map(uploadOne));
  for (let j = 0; j < results.length; j++) {
    if (results[j].status === 'fulfilled') okCount++;
    else {
      errCount++;
      console.error(`   ❌ ${batch[j].key}:`, results[j].reason?.message || results[j].reason);
    }
  }
  process.stdout.write(`\r   업로드 중... ${okCount + errCount}/${files.length} (ok ${okCount}, err ${errCount})`);
}

console.log(`\n✅ 완료: ${okCount}건 / ${errCount}건 실패 / ${((Date.now() - t0) / 1000).toFixed(1)}초`);

// 4) 샘플 URL 출력
const sample = files[0];
if (sample) {
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(sample.key);
  console.log(`\n샘플 public URL:\n  ${data.publicUrl}`);
}
