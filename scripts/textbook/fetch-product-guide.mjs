// 일룸 제품 가이드 사이트 — 5개 탭 모두 가져오기
// 사용법: node scripts/textbook/fetch-product-guide.mjs <p_id>
// 예: node scripts/textbook/fetch-product-guide.mjs 21977

import { chromium } from 'playwright';
import fs from 'fs/promises';
import path from 'path';

const LOGIN_URL = 'https://iloomproduct.fursys.com/wp-login.php';
const ID = process.env.ILOOM_GUIDE_ID;
const PW = process.env.ILOOM_GUIDE_PW;
if (!ID || !PW) throw new Error('ILOOM_GUIDE_ID, ILOOM_GUIDE_PW 환경변수를 설정해주세요.');

const pid = process.argv[2] || '21977';
const TARGET_URL = `https://iloomproduct.fursys.com/?p=${pid}`;

const OUT_DIR = path.resolve('scripts/textbook/output', `p${pid}`);

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext();
const page = await ctx.newPage();

console.log('1) 로그인...');
await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded' });
await page.fill('#user_login', ID);
await page.fill('#user_pass', PW);
await page.click('#wp-submit');
await page.waitForLoadState('networkidle');

console.log('2) 타겟 페이지 접속:', TARGET_URL);
await page.goto(TARGET_URL, { waitUntil: 'networkidle' });

await fs.mkdir(OUT_DIR, { recursive: true });

const tabResults = [];

// 5개 탭 순회
for (let tabNo = 1; tabNo <= 5; tabNo++) {
  console.log(`\n3-${tabNo}) 탭 ${tabNo} 처리...`);

  if (tabNo > 1) {
    // 탭 N 페이지 직접 URL 접속 (WordPress 표준 페이지네이션)
    const candidateUrls = [
      `${TARGET_URL}&page=${tabNo}`,
      `${TARGET_URL}/page/${tabNo}`,
      `${TARGET_URL}&paged=${tabNo}`,
    ];
    let success = false;
    for (const url of candidateUrls) {
      try {
        await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
        await page.waitForTimeout(800);
        success = true;
        break;
      } catch (e) {
        console.log(`   ${url} 실패: ${(e).message.slice(0, 80)}`);
      }
    }
    if (!success) {
      console.log(`   탭 ${tabNo}: 모든 URL 실패, 스킵`);
      continue;
    }
  }

  // 콘텐츠 추출 (body 전체 + 표 + 이미지)
  const data = await page.evaluate(() => {
    // 본문은 가장 텍스트가 많은 article/main/section을 탐색, 없으면 body
    const candidates = Array.from(document.querySelectorAll('article, main, .entry-content, #content, .post-content, .post, section'));
    let bestRoot = document.body;
    let bestLen = 0;
    for (const el of candidates) {
      const len = (el.innerText || '').length;
      if (len > bestLen) { bestLen = len; bestRoot = el; }
    }
    const text = (bestRoot.innerText || document.body.innerText || '').slice(0, 15000);

    // 표 추출
    const tables = Array.from(document.querySelectorAll('table')).map((tbl) => {
      const rows = Array.from(tbl.querySelectorAll('tr')).map((tr) =>
        Array.from(tr.querySelectorAll('th, td')).map((c) => (c.textContent || '').trim()),
      );
      return rows;
    });

    // 큰 이미지
    const images = Array.from(document.querySelectorAll('img'))
      .filter((img) => img.naturalWidth >= 200 && img.naturalHeight >= 200)
      .map((img) => ({ src: img.src, alt: img.alt || '', w: img.naturalWidth, h: img.naturalHeight }))
      .slice(0, 30);

    return { text, tables, images, url: location.href, title: document.title };
  });

  await fs.writeFile(path.join(OUT_DIR, `tab${tabNo}.json`), JSON.stringify(data, null, 2), 'utf-8');
  await page.screenshot({ path: path.join(OUT_DIR, `tab${tabNo}.png`), fullPage: true });

  tabResults.push({ tab: tabNo, url: data.url, text_length: data.text.length, tables: data.tables.length, images: data.images.length });
  console.log(`   ✓ ${data.url} (텍스트 ${data.text.length}자, 표 ${data.tables.length}개, 이미지 ${data.images.length}개)`);
}

await browser.close();

console.log('\n=== 요약 ===');
console.table(tabResults);
console.log(`\n결과 저장: ${OUT_DIR}`);
