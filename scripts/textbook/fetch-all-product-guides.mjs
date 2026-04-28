// 일룸 제품가이드 175개 시리즈 일괄 크롤링 → Supabase textbook_product_guide
// 사용법:
//   node scripts/textbook/fetch-all-product-guides.mjs              # 전체 (이미 fetch한 시리즈는 스킵)
//   node scripts/textbook/fetch-all-product-guides.mjs --force      # 전체 재크롤링
//   node scripts/textbook/fetch-all-product-guides.mjs --limit 5    # 처음 5개만 (테스트)
//   node scripts/textbook/fetch-all-product-guides.mjs --resume     # 실패한 시리즈만 재시도
//
// 시간: 시리즈당 ~20초 × 175개 = 약 1시간

import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import fs from 'fs/promises';
import path from 'path';

config({ path: '.env.local' });

const LOGIN_URL = 'https://iloomproduct.fursys.com/wp-login.php';
const ID = 'seoyeon_lee';
const PW = 'iloomguide2020';

const args = process.argv.slice(2);
const FORCE = args.includes('--force');
const RESUME = args.includes('--resume');
const LIMIT = (() => {
  const i = args.indexOf('--limit');
  return i >= 0 && args[i + 1] ? parseInt(args[i + 1]) : 0;
})();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

console.log('1) 카탈로그 로드 중...');
const catalog = JSON.parse(await fs.readFile(path.resolve('public', 'iloom-catalog.json'), 'utf-8'));
const targets = catalog.filter((s) => s.is_target);
console.log(`   → is_target 시리즈 ${targets.length}개`);

// 이미 fetch한 시리즈 조회 (재실행 시 스킵)
console.log('2) DB 기존 데이터 확인 중...');
const { data: existing } = await supabase
  .from('textbook_product_guide')
  .select('page_id, fetch_status');
const okMap = new Map((existing || []).map((r) => [r.page_id, r.fetch_status]));
console.log(`   → 기존 ${okMap.size}건 (ok: ${[...okMap.values()].filter((v) => v === 'ok').length})`);

let queue = targets;
if (FORCE) {
  console.log('   --force: 전체 재크롤링');
} else if (RESUME) {
  queue = targets.filter((s) => {
    const status = okMap.get(s.page_id);
    return !status || status === 'error';
  });
  console.log(`   --resume: 미완료/실패 ${queue.length}개만`);
} else {
  queue = targets.filter((s) => okMap.get(s.page_id) !== 'ok');
  console.log(`   기본: ok 아닌 ${queue.length}개 처리 (이미 ok는 스킵)`);
}

if (LIMIT > 0) {
  queue = queue.slice(0, LIMIT);
  console.log(`   --limit ${LIMIT}: ${queue.length}개로 제한`);
}

if (queue.length === 0) {
  console.log('\n✅ 처리할 시리즈가 없습니다. 모두 완료 상태.');
  process.exit(0);
}

console.log('\n3) 브라우저 시작 + 로그인...');
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext();
const page = await ctx.newPage();

await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded' });
await page.fill('#user_login', ID);
await page.fill('#user_pass', PW);
await page.click('#wp-submit');
await page.waitForLoadState('networkidle');
console.log('   ✓ 로그인 완료');

const t0 = Date.now();
let okCount = 0;
let errorCount = 0;

for (let i = 0; i < queue.length; i++) {
  const s = queue[i];
  const pid = s.page_id;
  const targetUrl = `https://iloomproduct.fursys.com/?p=${pid}`;
  const elapsed = (Date.now() - t0) / 1000;
  const avg = i > 0 ? elapsed / i : 20;
  const eta = Math.round((avg * (queue.length - i)) / 60);
  process.stdout.write(`\r[${i + 1}/${queue.length}] ${s.series_name.padEnd(20)} (ok ${okCount}, err ${errorCount}, ETA ${eta}분)     `);

  try {
    const tabs = {};
    let lastUrl = targetUrl;
    let lastTitle = '';

    for (let tabNo = 1; tabNo <= 5; tabNo++) {
      const url = tabNo === 1 ? targetUrl : `${targetUrl}&page=${tabNo}`;
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 });
        await page.waitForTimeout(600);

        const data = await page.evaluate(() => {
          const candidates = Array.from(
            document.querySelectorAll('article, main, .entry-content, #content, .post-content, .post, section')
          );
          let bestRoot = document.body;
          let bestLen = 0;
          for (const el of candidates) {
            const len = (el.innerText || '').length;
            if (len > bestLen) {
              bestLen = len;
              bestRoot = el;
            }
          }
          const text = (bestRoot.innerText || document.body.innerText || '').slice(0, 15000);
          const tables = Array.from(document.querySelectorAll('table')).map((tbl) =>
            Array.from(tbl.querySelectorAll('tr')).map((tr) =>
              Array.from(tr.querySelectorAll('th, td')).map((c) => (c.textContent || '').trim())
            )
          );
          const images = Array.from(document.querySelectorAll('img'))
            .filter((img) => img.naturalWidth >= 200 && img.naturalHeight >= 200)
            .map((img) => ({ src: img.src, alt: img.alt || '', w: img.naturalWidth, h: img.naturalHeight }))
            .slice(0, 30);
          return { text, tables, images, url: location.href, title: document.title };
        });

        tabs[`tab${tabNo}`] = data;
        lastUrl = data.url;
        lastTitle = data.title;
      } catch (tabErr) {
        tabs[`tab${tabNo}`] = { error: tabErr.message.slice(0, 200) };
      }
    }

    // upsert
    const { error: upErr } = await supabase.from('textbook_product_guide').upsert(
      {
        page_id: pid,
        series_name: s.series_name,
        category: s.category,
        url: targetUrl,
        tab1: tabs.tab1 || null,
        tab2: tabs.tab2 || null,
        tab3: tabs.tab3 || null,
        tab4: tabs.tab4 || null,
        tab5: tabs.tab5 || null,
        full_html: null,
        fetch_status: Object.values(tabs).every((t) => !t.error) ? 'ok' : 'partial',
        fetch_error: null,
        fetched_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'page_id' }
    );

    if (upErr) throw upErr;
    okCount++;
  } catch (e) {
    errorCount++;
    await supabase.from('textbook_product_guide').upsert(
      {
        page_id: pid,
        series_name: s.series_name,
        category: s.category,
        url: targetUrl,
        fetch_status: 'error',
        fetch_error: String(e.message || e).slice(0, 500),
        fetched_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'page_id' }
    );
    process.stdout.write(`\n   ❌ ${s.series_name} (p=${pid}): ${String(e.message || e).slice(0, 100)}\n`);
  }

  await page.waitForTimeout(400);
}

await browser.close();

const total = (Date.now() - t0) / 1000;
console.log(`\n\n✅ 완료: ${okCount}건 성공 / ${errorCount}건 실패 / ${total.toFixed(0)}초 (${(total / 60).toFixed(1)}분)`);

// 최종 통계
const { count: totalCount } = await supabase
  .from('textbook_product_guide')
  .select('*', { count: 'exact', head: true });
const { count: errCount } = await supabase
  .from('textbook_product_guide')
  .select('*', { count: 'exact', head: true })
  .eq('fetch_status', 'error');
console.log(`DB 상태: 총 ${totalCount}건 / 에러 ${errCount}건`);
