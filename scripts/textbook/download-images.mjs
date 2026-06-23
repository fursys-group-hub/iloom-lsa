// WordPress 가이드 페이지에서 이미지 다운로드 → Supabase Storage 직접 업로드
// 사용법: node scripts/textbook/download-images.mjs <p_id> <시리즈명> [--local-only]
// 예: node scripts/textbook/download-images.mjs 21977 코펜하겐
//
// 기본: Supabase Storage 'textbook-images' bucket에 'p<pid>/<sanitized-filename>' 키로 업로드
//        + scripts/textbook/output/series-<시리즈명>/images-meta.json 에 메타 저장
// --local-only: Storage 업로드 스킵 (디버그용으로 로컬에만 저장)

import { chromium } from 'playwright';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config({ path: '.env.local' });

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const LOGIN_URL = 'https://iloomproduct.fursys.com/wp-login.php';
const ID = process.env.ILOOM_GUIDE_ID;
const PW = process.env.ILOOM_GUIDE_PW;
if (!ID || !PW) throw new Error('ILOOM_GUIDE_ID, ILOOM_GUIDE_PW 환경변수를 설정해주세요.');
const BUCKET = 'textbook-images';

const args = process.argv.slice(2);
const LOCAL_ONLY = args.includes('--local-only');
const positional = args.filter((a) => !a.startsWith('--'));
const pid = positional[0] || '21977';
const seriesName = positional[1] || '코펜하겐';
const TARGET_URL = `https://iloomproduct.fursys.com/?p=${pid}`;

const META_DIR = path.resolve('scripts/textbook/output', `series-${seriesName}`);
const META_PATH = path.join(META_DIR, 'images-meta.json');
await fs.mkdir(META_DIR, { recursive: true });

const supabase = LOCAL_ONLY ? null : createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

// Storage URL 베이스
const SUPA_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '');
const STORAGE_BASE = `${SUPA_URL}/storage/v1/object/public/${BUCKET}`;

function sanitizeFilename(name) {
  const ext = path.extname(name);
  const base = path.basename(name, ext);
  const clean = base.replace(/[^A-Za-z0-9_.\-]/g, '').replace(/_+$/, '').replace(/^_+/, '') || 'unnamed';
  return clean + ext.toLowerCase();
}

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext();
const page = await ctx.newPage();

console.log('1) 로그인...');
await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded' });
await page.fill('#user_login', ID);
await page.fill('#user_pass', PW);
await page.click('#wp-submit');
await page.waitForLoadState('networkidle');

const allImages = [];

for (let tabNo = 1; tabNo <= 5; tabNo++) {
  console.log(`\n2-${tabNo}) 탭 ${tabNo}...`);
  const url = tabNo === 1 ? TARGET_URL : `${TARGET_URL}&page=${tabNo}`;
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);

  const images = await page.evaluate(() => {
    const imgs = Array.from(document.querySelectorAll('img'));
    return imgs
      .filter((img) => img.naturalWidth >= 200 && img.naturalHeight >= 200)
      .map((img) => {
        // 인접한 텍스트 추출 (캡션, 부모 요소 텍스트)
        const parentText = (img.parentElement?.innerText || '').trim().slice(0, 200);
        const grandText = (img.parentElement?.parentElement?.innerText || '').trim().slice(0, 300);
        // 형제 노드 (앞/뒤 형제)
        const prev = img.previousElementSibling?.textContent?.trim().slice(0, 100) || '';
        const next = img.nextElementSibling?.textContent?.trim().slice(0, 100) || '';
        return {
          src: img.src,
          alt: img.alt || '',
          w: img.naturalWidth,
          h: img.naturalHeight,
          parent_text: parentText,
          grand_text: grandText,
          prev_text: prev,
          next_text: next,
        };
      });
  });

  for (const img of images) {
    img.tab = tabNo;
    allImages.push(img);
  }
  console.log(`   이미지 ${images.length}개 발견`);
}

// 중복 제거 (같은 src)
const uniq = new Map();
for (const img of allImages) {
  if (!uniq.has(img.src)) uniq.set(img.src, img);
}
const unique = Array.from(uniq.values());
console.log(`\n중복 제거 후: ${unique.length}개`);

// 페이지 인증 쿠키로 다운로드 → Supabase Storage 업로드
console.log('\n3) 다운로드 + Storage 업로드...');
const STORAGE_PREFIX = `p${pid}`;
const meta = [];
let i = 0;
let okCount = 0;
let errCount = 0;

for (const img of unique) {
  i++;
  const ext = (path.extname(new URL(img.src).pathname) || '.png').toLowerCase();
  const baseName = sanitizeFilename(`${String(i).padStart(2, '0')}_${img.w}x${img.h}_tab${img.tab}${ext}`);
  const storageKey = `${STORAGE_PREFIX}/${baseName}`;
  const publicUrl = `${STORAGE_BASE}/${storageKey}`;

  try {
    // page.context()의 cookies로 인증된 fetch
    const response = await page.request.get(img.src);
    if (!response.ok()) throw new Error(`HTTP ${response.status()}`);
    const buf = await response.body();

    if (!LOCAL_ONLY) {
      // Supabase Storage upsert
      const ct = ext === '.png' ? 'image/png' : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : ext === '.webp' ? 'image/webp' : 'application/octet-stream';
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(storageKey, buf, {
        contentType: ct,
        upsert: true,
      });
      if (upErr) throw new Error(`Storage upload: ${upErr.message}`);
    }

    meta.push({
      file: baseName,
      storage_key: storageKey,
      public_url: publicUrl,
      ...img,
    });
    okCount++;
    console.log(`   ✓ ${storageKey} (${(buf.length / 1024).toFixed(0)}KB)`);
  } catch (e) {
    errCount++;
    console.log(`   ❌ ${img.src} 실패: ${e.message.slice(0, 100)}`);
  }
}

await fs.writeFile(META_PATH, JSON.stringify(meta, null, 2), 'utf-8');
await browser.close();

console.log(`\n✅ ${okCount}건 업로드 / ${errCount}건 실패`);
console.log(`   메타 정보: ${META_PATH}`);
if (!LOCAL_ONLY) {
  console.log(`   Storage 베이스: ${STORAGE_BASE}/${STORAGE_PREFIX}/`);
  console.log(`   샘플 URL: ${meta[0]?.public_url || '(없음)'}`);
} else {
  console.log(`   --local-only 모드: Storage 업로드 스킵됨`);
}
