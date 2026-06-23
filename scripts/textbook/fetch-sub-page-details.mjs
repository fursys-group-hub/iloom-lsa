// 시리즈의 sub_pages 상세 페이지(book상/책장/옷장 등) 본문 fetch
// 사용법: node scripts/textbook/fetch-sub-page-details.mjs <시리즈명>
// 결과: scripts/textbook/output/series-{name}/sub-pages-detail.json

import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import fs from 'fs/promises';
import path from 'path';

config({ path: '.env.local' });

const seriesName = process.argv[2];
if (!seriesName) {
  console.error('사용법: node scripts/textbook/fetch-sub-page-details.mjs <시리즈명>');
  process.exit(1);
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// all-data.json에서 sub_pages 가져옴
const OUT_DIR = path.resolve('scripts/textbook/output', `series-${seriesName}`);
const data = JSON.parse(await fs.readFile(path.join(OUT_DIR, 'all-data.json'), 'utf-8'));
const subs = data.product_guides.flatMap((g) => g.sub_pages || []).filter((sp) => !/단종/.test(sp.title));
console.log(`${seriesName}: sub-페이지 ${subs.length}개`);

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext();
const page = await ctx.newPage();

const LOGIN_URL = 'https://iloomproduct.fursys.com/wp-login.php';
await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded' });
const GUIDE_ID = process.env.ILOOM_GUIDE_ID;
const GUIDE_PW = process.env.ILOOM_GUIDE_PW;
if (!GUIDE_ID || !GUIDE_PW) throw new Error('ILOOM_GUIDE_ID, ILOOM_GUIDE_PW 환경변수를 설정해주세요.');
await page.fill('#user_login', GUIDE_ID);
await page.fill('#user_pass', GUIDE_PW);
await page.click('#wp-submit');
await page.waitForLoadState('networkidle');
console.log('로그인 완료');

const details = [];
for (let i = 0; i < subs.length; i++) {
  const sp = subs[i];
  process.stdout.write(`\r[${i + 1}/${subs.length}] ${sp.title.padEnd(30)}`);
  try {
    const tabs = {};
    for (let tabNo = 1; tabNo <= 5; tabNo++) {
      const url = tabNo === 1 ? sp.url : `${sp.url}&page=${tabNo}`;
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 });
        await page.waitForTimeout(500);
        const td = await page.evaluate(() => {
          const candidates = Array.from(document.querySelectorAll('article, main, .entry-content, #content, .post'));
          let best = document.body, bestLen = 0;
          for (const el of candidates) {
            const len = (el.innerText || '').length;
            if (len > bestLen) { bestLen = len; best = el; }
          }
          return (best.innerText || '').slice(0, 5000);
        });
        tabs[`tab${tabNo}`] = td;
      } catch {}
    }
    details.push({ ...sp, tabs });
  } catch (e) {
    details.push({ ...sp, error: e.message });
  }
}
await browser.close();

const outFile = path.join(OUT_DIR, 'sub-pages-detail.json');
await fs.writeFile(outFile, JSON.stringify(details, null, 2), 'utf-8');
console.log(`\n✅ 저장: ${outFile}`);
const totalText = details.reduce((s, d) => s + Object.values(d.tabs || {}).reduce((a, t) => a + (t?.length || 0), 0), 0);
console.log(`   총 텍스트: ${totalText.toLocaleString()}자`);
