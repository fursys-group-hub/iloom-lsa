// 일룸 가이드 시리즈 페이지 안의 sub 페이지(품목 리스트) 패턴 분석
// 사용법: node scripts/textbook/analyze-sub-pages.mjs <page_id>
// 예: node scripts/textbook/analyze-sub-pages.mjs 27750  (에디키즈)

import { chromium } from 'playwright';
import fs from 'fs/promises';
import path from 'path';

const LOGIN_URL = 'https://iloomproduct.fursys.com/wp-login.php';
const ID = process.env.ILOOM_GUIDE_ID;
const PW = process.env.ILOOM_GUIDE_PW;
if (!ID || !PW) throw new Error('ILOOM_GUIDE_ID, ILOOM_GUIDE_PW 환경변수를 설정해주세요.');

const pid = process.argv[2] || '27750';
const TARGET_URL = `https://iloomproduct.fursys.com/?p=${pid}`;
const OUT = path.resolve('scripts/textbook/output', `analyze-p${pid}`);
await fs.mkdir(OUT, { recursive: true });

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext();
const page = await ctx.newPage();

console.log('1) 로그인...');
await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded' });
await page.fill('#user_login', ID);
await page.fill('#user_pass', PW);
await page.click('#wp-submit');
await page.waitForLoadState('networkidle');

console.log(`2) 타겟 페이지: ${TARGET_URL}`);
const allTabs = [];

for (let tabNo = 1; tabNo <= 5; tabNo++) {
  const url = tabNo === 1 ? TARGET_URL : `${TARGET_URL}&page=${tabNo}`;
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(800);

  const tabData = await page.evaluate((selfPid) => {
    // 모든 ?p= 링크 추출
    const links = Array.from(document.querySelectorAll('a'))
      .filter((a) => /[?&]p=\d+/.test(a.href))
      .map((a) => {
        const u = new URL(a.href);
        const linkPid = parseInt(u.searchParams.get('p') || '0', 10);
        const text = (a.textContent || '').trim();
        // 부모 요소 컨텍스트 (어떤 표/섹션 안인지)
        let parent = a.parentElement;
        const parentInfo = [];
        for (let depth = 0; depth < 4 && parent; depth++) {
          const tag = parent.tagName.toLowerCase();
          const cls = parent.className?.slice(0, 30) || '';
          const id = parent.id?.slice(0, 30) || '';
          parentInfo.push(`${tag}${id ? '#' + id : ''}${cls ? '.' + cls : ''}`);
          parent = parent.parentElement;
        }
        // 형제 텍스트 (앞 헤더 등)
        const prevSiblingText = a.previousElementSibling?.textContent?.trim().slice(0, 80) || '';
        // 같은 셀 안의 다른 요소 (앞쪽)
        const tdParent = a.closest('td, th, li');
        const tdText = tdParent ? (tdParent.textContent || '').trim().slice(0, 200) : '';
        return {
          pid: linkPid,
          text,
          href: a.href,
          parents: parentInfo,
          prev_sibling: prevSiblingText,
          td_text: tdText,
          is_self: linkPid === selfPid,
        };
      });

    // 표/섹션별 그룹핑
    const sections = [];
    const tables = Array.from(document.querySelectorAll('table'));
    tables.forEach((t, ti) => {
      const links = Array.from(t.querySelectorAll('a'))
        .filter((a) => /[?&]p=\d+/.test(a.href))
        .map((a) => ({
          text: (a.textContent || '').trim(),
          href: a.href,
        }));
      if (links.length > 0) {
        sections.push({
          type: 'table',
          idx: ti,
          rows: t.querySelectorAll('tr').length,
          first_row_text: t.querySelector('tr')?.textContent?.trim().slice(0, 200),
          links,
        });
      }
    });

    return {
      url: location.href,
      title: document.title,
      total_links: links.length,
      links,
      sections,
    };
  }, parseInt(pid, 10));

  await fs.writeFile(path.join(OUT, `tab${tabNo}.json`), JSON.stringify(tabData, null, 2), 'utf-8');
  allTabs.push({ tab: tabNo, ...tabData });
  console.log(`   탭${tabNo}: 총 ${tabData.total_links}개 링크 / 표 ${tabData.sections.length}개`);
}

await browser.close();

// === 분석 요약 ===
console.log('\n=== 분석 요약 ===');
const allLinks = allTabs.flatMap((t) => t.links.map((l) => ({ tab: t.tab, ...l })));
const otherPids = new Set(allLinks.filter((l) => !l.is_self).map((l) => l.pid));
console.log(`총 외부 page_id: ${otherPids.size}개`);

// 현재 카탈로그와 비교 (이 시리즈가 카탈로그에 있는지, 다른 링크가 카탈로그에 있는지)
const catalog = JSON.parse(await fs.readFile(path.resolve('public', 'iloom-catalog.json'), 'utf-8'));
const catPids = new Set(catalog.filter((s) => s.is_target).map((s) => s.page_id));
const inCat = [...otherPids].filter((p) => catPids.has(p));
const notInCat = [...otherPids].filter((p) => !catPids.has(p));
console.log(`  카탈로그(is_target)에 있는 페이지: ${inCat.length}개`);
console.log(`  카탈로그에 없는 페이지(sub 후보): ${notInCat.length}개`);

console.log('\nsub 후보 링크 (카탈로그에 없는 page_id):');
for (const pid of notInCat) {
  const samples = allLinks.filter((l) => l.pid === pid).slice(0, 1);
  for (const s of samples) {
    console.log(`  p=${pid}: "${s.text}" (탭${s.tab})`);
    console.log(`    부모: ${s.parents.join(' > ')}`);
    console.log(`    셀: ${s.td_text.slice(0, 100)}`);
  }
}

console.log(`\n결과 저장: ${OUT}/`);
