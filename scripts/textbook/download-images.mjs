// WordPress 가이드 페이지에서 이미지 다운로드 + 인접 텍스트로 색상/제품 매칭
// 사용법: node scripts/textbook/download-images.mjs <p_id> <시리즈명>
// 예: node scripts/textbook/download-images.mjs 21977 코펜하겐

import { chromium } from 'playwright';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const LOGIN_URL = 'https://iloomproduct.fursys.com/wp-login.php';
const ID = 'seoyeon_lee';
const PW = 'iloomguide2020';

const pid = process.argv[2] || '21977';
const seriesName = process.argv[3] || '코펜하겐';
const TARGET_URL = `https://iloomproduct.fursys.com/?p=${pid}`;

// public/textbook-images/{시리즈명}/ 에 저장 (Next.js 정적 서빙)
const PUBLIC_DIR = path.resolve('public', 'textbook-images', seriesName);
const META_PATH = path.resolve('scripts/textbook/output', `series-${seriesName}`, 'images-meta.json');
await fs.mkdir(PUBLIC_DIR, { recursive: true });

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

// 페이지 인증 쿠키로 다운로드 (인증 필요할 수도)
console.log('\n3) 다운로드...');
const meta = [];
let i = 0;
for (const img of unique) {
  i++;
  const ext = path.extname(new URL(img.src).pathname) || '.png';
  const baseName = `${String(i).padStart(2, '0')}_${img.w}x${img.h}_tab${img.tab}${ext}`;
  const dest = path.join(PUBLIC_DIR, baseName);

  try {
    // page.context()의 cookies로 인증된 fetch
    const response = await page.request.get(img.src);
    if (!response.ok()) throw new Error(`HTTP ${response.status()}`);
    const buf = await response.body();
    await fs.writeFile(dest, buf);
    const publicPath = `/textbook-images/${seriesName}/${baseName}`;
    meta.push({
      file: baseName,
      public_path: publicPath,
      ...img,
    });
    console.log(`   ${baseName} (${(buf.length / 1024).toFixed(0)}KB)`);
  } catch (e) {
    console.log(`   ❌ ${img.src} 실패: ${e.message.slice(0, 80)}`);
  }
}

await fs.writeFile(META_PATH, JSON.stringify(meta, null, 2), 'utf-8');
await browser.close();

console.log(`\n✅ ${meta.length}개 이미지 다운로드 완료`);
console.log(`   저장 폴더: ${PUBLIC_DIR}`);
console.log(`   메타 정보: ${META_PATH}`);
console.log(`   웹 접근: http://localhost:3000/textbook-images/${seriesName}/...`);
