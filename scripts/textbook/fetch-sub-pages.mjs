// 일룸 가이드 시리즈 페이지의 sub-품목 메타 추출 → textbook_product_guide.sub_pages 갱신
// 사용법:
//   node scripts/textbook/fetch-sub-pages.mjs              # 전체 174개 시리즈
//   node scripts/textbook/fetch-sub-pages.mjs --limit 1    # 처음 1개만 (테스트)
//   node scripts/textbook/fetch-sub-pages.mjs --series 에디키즈  # 특정 시리즈
//
// 시간: 시리즈당 ~3초 × 174 = 약 9분 (탭 1개만 방문)

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
const LIMIT = (() => { const i = args.indexOf('--limit'); return i >= 0 && args[i + 1] ? parseInt(args[i + 1]) : 0; })();
const SERIES_FILTER = (() => { const i = args.indexOf('--series'); return i >= 0 && args[i + 1] ? args[i + 1] : null; })();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

console.log('1) 카탈로그 로드...');
const catalog = JSON.parse(await fs.readFile(path.resolve('public', 'iloom-catalog.json'), 'utf-8'));
const targets = catalog.filter((s) => s.is_target);
const catalogPids = Array.from(new Set(targets.map((s) => s.page_id)));
console.log(`   → is_target ${targets.length}개 / 고유 page_id ${catalogPids.length}개`);

let queue = targets;
if (SERIES_FILTER) {
  queue = queue.filter((s) => s.series_name.includes(SERIES_FILTER));
  console.log(`   --series '${SERIES_FILTER}': ${queue.length}개`);
}
if (LIMIT > 0) {
  queue = queue.slice(0, LIMIT);
  console.log(`   --limit ${LIMIT}: ${queue.length}개`);
}

// page_id 중복 제거 (같은 page_id에 여러 시리즈 카드가 있어도 한 번만 처리)
const seenPids = new Set();
queue = queue.filter((s) => {
  if (seenPids.has(s.page_id)) return false;
  seenPids.add(s.page_id);
  return true;
});
console.log(`   page_id 중복 제거 후: ${queue.length}개\n`);

console.log('2) 브라우저 시작 + 로그인...');
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext();
const page = await ctx.newPage();

await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded' });
await page.fill('#user_login', ID);
await page.fill('#user_pass', PW);
await page.click('#wp-submit');
await page.waitForLoadState('networkidle');
console.log('   ✓ 로그인 완료\n');

const t0 = Date.now();
let okCount = 0;
let errCount = 0;
let totalSubs = 0;

for (let i = 0; i < queue.length; i++) {
  const s = queue[i];
  const pid = s.page_id;
  const targetUrl = `https://iloomproduct.fursys.com/?p=${pid}`;
  const elapsed = (Date.now() - t0) / 1000;
  const avg = i > 0 ? elapsed / i : 3;
  const eta = Math.round((avg * (queue.length - i)) / 60);
  process.stdout.write(`\r[${i + 1}/${queue.length}] ${s.series_name.padEnd(20)} (ok ${okCount}, err ${errCount}, ETA ${eta}분)     `);

  try {
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 25000 });
    await page.waitForTimeout(500);

    const subPages = await page.evaluate(({ selfPid, catalogPids }) => {
      const catSet = new Set(catalogPids);
      const links = Array.from(document.querySelectorAll('a'));
      const seen = new Set();
      const subs = [];

      for (const a of links) {
        if (!/[?&]p=\d+/.test(a.href)) continue;
        let pid;
        try {
          pid = parseInt(new URL(a.href).searchParams.get('p') || '0', 10);
        } catch {
          continue;
        }
        if (!pid || pid === selfPid) continue;
        if (catSet.has(pid)) continue; // 카탈로그(is_target)에 있는 시리즈는 sub 아님
        if (seen.has(pid)) continue;

        // 부모 검사: 본문 영역 안 + 메뉴 영역 밖
        let inHeading = false;
        let inEntry = false;
        let inMenu = false;
        let parent = a.parentElement;
        while (parent) {
          const tag = parent.tagName ? parent.tagName.toLowerCase() : '';
          const cls = typeof parent.className === 'string' ? parent.className : '';
          if (tag === 'h5' && cls.includes('wp-block-heading')) inHeading = true;
          if (cls.includes('entry-content') || cls.includes('nv-content-wrap')) inEntry = true;
          if (tag === 'nav' || cls.includes('menu-item') || cls.includes('nav-ul') || cls.includes('nav-menu')) inMenu = true;
          parent = parent.parentElement;
        }
        if (inMenu) continue;
        if (!inHeading && !inEntry) continue;

        const title = (a.textContent || '').trim();
        if (!title) continue;
        if (/^(업데이트|매뉴얼|GPT|가이드|업데이트 요청)/.test(title)) continue;

        subs.push({ page_id: pid, title, url: a.href });
        seen.add(pid);
      }
      return subs;
    }, { selfPid: pid, catalogPids });

    // upsert
    const { error: upErr } = await supabase
      .from('textbook_product_guide')
      .update({ sub_pages: subPages, updated_at: new Date().toISOString() })
      .eq('page_id', pid);

    if (upErr) throw upErr;

    totalSubs += subPages.length;
    okCount++;
    if (subPages.length > 0) {
      process.stdout.write(`\n   ✓ ${s.series_name}: sub ${subPages.length}개 — ${subPages.slice(0, 3).map((p) => p.title).join(', ')}${subPages.length > 3 ? '...' : ''}\n`);
    }
  } catch (e) {
    errCount++;
    process.stdout.write(`\n   ❌ ${s.series_name}: ${String(e.message || e).slice(0, 100)}\n`);
  }

  await page.waitForTimeout(200);
}

await browser.close();

const total = (Date.now() - t0) / 1000;
console.log(`\n\n✅ 완료: ${okCount}건 / ${errCount}건 실패 / 총 sub ${totalSubs}개 / ${(total / 60).toFixed(1)}분`);

// 통계
const { data: withSubs } = await supabase
  .from('textbook_product_guide')
  .select('series_name, sub_pages')
  .gt('sub_pages', '[]'); // sub_pages가 빈 배열 아닌 것
const haveSub = (withSubs || []).filter((r) => Array.isArray(r.sub_pages) && r.sub_pages.length > 0);
console.log(`\nDB 통계: sub_pages 있는 시리즈 ${haveSub.length}개`);
haveSub.sort((a, b) => b.sub_pages.length - a.sub_pages.length).slice(0, 10).forEach((r) => {
  console.log(`  ${r.series_name}: ${r.sub_pages.length}개`);
});
