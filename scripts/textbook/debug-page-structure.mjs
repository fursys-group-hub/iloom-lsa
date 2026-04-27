// 카테고리 페이지의 HTML 구조 디버그
// node scripts/textbook/debug-page-structure.mjs <page_id>

import { chromium } from 'playwright';

const LOGIN_URL = 'https://iloomproduct.fursys.com/wp-login.php';
const ID = 'seoyeon_lee';
const PW = 'iloomguide2020';
const pid = process.argv[2] || '154';

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext();
const page = await ctx.newPage();

await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded' });
await page.fill('#user_login', ID);
await page.fill('#user_pass', PW);
await page.click('#wp-submit');
await page.waitForLoadState('networkidle');

await page.goto(`https://iloomproduct.fursys.com/?page_id=${pid}`, { waitUntil: 'networkidle' });
await page.waitForTimeout(800);

const info = await page.evaluate(() => {
  return {
    title: document.title,
    tables: document.querySelectorAll('table').length,
    all_a_p_links: Array.from(document.querySelectorAll('a'))
      .filter((a) => /[?&]p=\d+/.test(a.href))
      .map((a) => ({ text: (a.textContent || '').trim().slice(0, 30), href: a.href.slice(0, 80) }))
      .slice(0, 50),
    body_text_sample: (document.body.innerText || '').slice(0, 1500),
  };
});

console.log('=== 페이지 정보 ===');
console.log('제목:', info.title);
console.log('표 개수:', info.tables);
console.log('?p= 링크 개수:', info.all_a_p_links.length);
console.log('\n--- 모든 시리즈 링크 ---');
for (const l of info.all_a_p_links) {
  console.log(`  ${l.text}  ←  ${l.href}`);
}
console.log('\n--- 본문 텍스트 (처음 1500자) ---');
console.log(info.body_text_sample);

await browser.close();
