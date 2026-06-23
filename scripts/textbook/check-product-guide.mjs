// 일룸 제품 가이드 사이트 한 페이지 진단
// 로그인 후 제품 페이지 HTML + 스크린샷 캡처

import { chromium } from 'playwright';
import fs from 'fs/promises';
import path from 'path';

const LOGIN_URL = 'https://iloomproduct.fursys.com/wp-login.php';
const TARGET_URL = 'https://iloomproduct.fursys.com/?p=21977';
const ID = process.env.ILOOM_GUIDE_ID;
const PW = process.env.ILOOM_GUIDE_PW;
if (!ID || !PW) throw new Error('ILOOM_GUIDE_ID, ILOOM_GUIDE_PW 환경변수를 설정해주세요.');

const OUT_DIR = path.resolve('scripts/textbook/output');

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext();
const page = await ctx.newPage();

console.log('1) 로그인 페이지 접속...');
await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded' });

console.log('2) 자격증명 입력...');
await page.fill('#user_login', ID);
await page.fill('#user_pass', PW);
await page.click('#wp-submit');
await page.waitForLoadState('networkidle');
console.log('   현재 URL:', page.url());

console.log('3) 타겟 페이지 접속...');
await page.goto(TARGET_URL, { waitUntil: 'networkidle' });
console.log('   현재 URL:', page.url());

await fs.mkdir(OUT_DIR, { recursive: true });

console.log('4) 스크린샷...');
await page.screenshot({ path: path.join(OUT_DIR, 'product-page.png'), fullPage: true });

console.log('5) HTML 저장...');
const html = await page.content();
await fs.writeFile(path.join(OUT_DIR, 'product-page.html'), html, 'utf-8');

console.log('6) 본문 텍스트 추출...');
const title = await page.title();
const bodyText = await page.evaluate(() => {
  // 메인 컨텐츠 영역 추정
  const main = document.querySelector('main, article, .entry-content, #content, .post-content');
  return (main?.innerText || document.body.innerText).slice(0, 5000);
});

// 이미지 찾기
const images = await page.evaluate(() => {
  const imgs = Array.from(document.querySelectorAll('img'));
  return imgs
    .filter((img) => {
      const r = img.getBoundingClientRect();
      return r.width > 100 && r.height > 100; // 큰 이미지만
    })
    .map((img) => ({ src: img.src, alt: img.alt, w: img.width, h: img.height }))
    .slice(0, 20);
});

console.log('\n=== 페이지 제목 ===');
console.log(title);

console.log('\n=== 본문 텍스트 (처음 3000자) ===');
console.log(bodyText.slice(0, 3000));

console.log('\n=== 큰 이미지 (최대 20개) ===');
for (const img of images) {
  console.log(`  ${img.w}x${img.h}  ${img.alt || '(no alt)'}  ${img.src}`);
}

await browser.close();
console.log('\n✅ 완료. 결과:', OUT_DIR);
