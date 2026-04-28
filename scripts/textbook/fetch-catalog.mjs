// 일룸 제품 가이드 — 카테고리별 시리즈 카탈로그 자동 수집
// 사용법: node scripts/textbook/fetch-catalog.mjs [page_id ...]
// 예: node scripts/textbook/fetch-catalog.mjs 158
// 인자 없으면 카테고리 전체 자동 발견

import { chromium } from 'playwright';
import fs from 'fs/promises';
import path from 'path';

const LOGIN_URL = 'https://iloomproduct.fursys.com/wp-login.php';
const HOME_URL = 'https://iloomproduct.fursys.com/';
const ID = 'seoyeon_lee';
const PW = 'iloomguide2020';

const OUT_DIR = path.resolve('scripts/textbook/output/catalog');
await fs.mkdir(OUT_DIR, { recursive: true });

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext();
const page = await ctx.newPage();

console.log('1) 로그인...');
await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded' });
await page.fill('#user_login', ID);
await page.fill('#user_pass', PW);
await page.click('#wp-submit');
await page.waitForLoadState('networkidle');

// 1) 메인 페이지에서 카테고리 링크 자동 발견
console.log('\n2) 메인 페이지 → 카테고리 링크 발견...');
await page.goto(HOME_URL, { waitUntil: 'networkidle' });

const argPageIds = process.argv.slice(2).map((s) => parseInt(s, 10)).filter(Boolean);

let categories;
// 카테고리 page_id → 한글명 매핑 (사용자 제공)
const CATEGORY_NAMES = {
  158: '리빙룸',
  160: '다이닝룸',
  154: '침실·옷장',
  52: '키즈룸·틴즈룸',
  150: '워크룸·멀티룸',
  162: '펫',
  59703: '조명',
  34578: '공통',
};

// 모든 카테고리 page_id (시리즈 목록에서 제외용)
const ALL_CATEGORY_IDS = new Set([158, 160, 154, 52, 150, 162, 59703, 34578]);

if (argPageIds.length > 0) {
  // 인자로 받은 page_id만 처리
  categories = argPageIds.map((id) => ({
    name: CATEGORY_NAMES[id] || `(page_id=${id})`,
    url: `${HOME_URL}?page_id=${id}`,
    page_id: id,
  }));
} else {
  // 메인 페이지 상단 메뉴에서 카테고리 링크 찾기
  categories = await page.evaluate(() => {
    const links = Array.from(document.querySelectorAll('a'));
    const candidates = links
      .filter((a) => /page_id=/.test(a.href))
      .map((a) => ({
        name: (a.textContent || '').trim(),
        url: a.href,
        page_id: parseInt(new URL(a.href).searchParams.get('page_id') || '0', 10),
      }))
      .filter((c) => c.name && c.page_id > 0);
    // 중복 제거 + 카테고리스러운 이름만 (3~10자 한글)
    const seen = new Set();
    return candidates.filter((c) => {
      if (seen.has(c.page_id)) return false;
      seen.add(c.page_id);
      return /^[가-힣·\s]+$/.test(c.name) && c.name.length <= 10;
    });
  });
}

console.log(`   발견된 카테고리: ${categories.length}개`);
for (const c of categories) console.log(`   - ${c.name} (page_id=${c.page_id})`);

// 2) 각 카테고리 페이지에서 시리즈 추출
const allSeries = [];

for (const cat of categories) {
  console.log(`\n3) "${cat.name}" 크롤링: ${cat.url}`);
  await page.goto(cat.url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);

  const seriesItems = await page.evaluate((CATEGORY_PAGE_IDS) => {
    const result = [];

    // 표 구조에서 품목/구분 추적용 (위치 기반 매핑)
    const positionContext = new Map(); // key=link element, value={pumok, gubun}
    const tables = Array.from(document.querySelectorAll('table'));

    function isSeriesLink(a) {
      return /[?&]p=\d+/.test(a.href) || /[?&]page_id=\d+/.test(a.href);
    }

    for (const table of tables) {
      // 1) rowspan/colspan을 처리한 가상 매트릭스 생성
      const trs = Array.from(table.querySelectorAll('tr'));
      const matrix = [];
      for (let r = 0; r < trs.length; r++) {
        if (!matrix[r]) matrix[r] = [];
        const cells = Array.from(trs[r].children).filter((el) => el.tagName === 'TD' || el.tagName === 'TH');
        let c = 0;
        for (const cell of cells) {
          while (matrix[r][c]) c++;
          const rs = parseInt(cell.getAttribute('rowspan') || '1', 10);
          const cs = parseInt(cell.getAttribute('colspan') || '1', 10);
          for (let dr = 0; dr < rs; dr++) {
            for (let dc = 0; dc < cs; dc++) {
              if (!matrix[r + dr]) matrix[r + dr] = [];
              matrix[r + dr][c + dc] = cell;
            }
          }
          c += cs;
        }
      }

      // 2) 각 행에서 시리즈 셀 위치 동적 감지 + 라벨 추출
      for (const row of matrix) {
        if (!row || row.length === 0) continue;

        // 시리즈 링크가 가장 많은 셀 = 시리즈 셀 (cell 인덱스)
        let seriesIdx = -1;
        let maxLinks = 0;
        const seenCellIds = new Set();
        for (let i = 0; i < row.length; i++) {
          const cell = row[i];
          if (!cell) continue;
          // 같은 cell이 colspan으로 여러 인덱스에 있을 수 있음 → 한 번만 평가
          if (seenCellIds.has(cell)) continue;
          seenCellIds.add(cell);
          const links = Array.from(cell.querySelectorAll('a')).filter(isSeriesLink);
          if (links.length > maxLinks) {
            maxLinks = links.length;
            seriesIdx = i;
          }
        }
        if (seriesIdx === -1) continue;

        // 라벨 셀 텍스트 (시리즈 셀 제외, 빈 텍스트 제거)
        const seriesCellEl = row[seriesIdx];
        const labelCells = [];
        const seenLabelIds = new Set();
        for (let i = 0; i < row.length; i++) {
          const cell = row[i];
          if (!cell || cell === seriesCellEl) continue;
          if (seenLabelIds.has(cell)) continue;
          seenLabelIds.add(cell);
          const txt = (cell.textContent || '').trim();
          if (txt) labelCells.push({ idx: i, text: txt });
        }

        // 시리즈 셀 위치로 표 패턴 분기
        // 패턴 A (리빙룸/다이닝룸): [pumok, gubun, series]  → seriesIdx === row.length - 1
        // 패턴 B (키즈룸·틴즈룸):   [구분, series, 비고]    → 비고를 pumok로 (더 세부 분류)
        let currentPumok = '';
        let currentGubun = '';
        if (seriesIdx === row.length - 1) {
          // 패턴 A: 시리즈가 마지막 → 앞쪽이 [pumok, gubun]
          if (labelCells[0]) currentPumok = labelCells[0].text;
          if (labelCells[1]) currentGubun = labelCells[1].text;
        } else {
          // 패턴 B: 시리즈가 중간 → 시리즈 뒤(비고) 우선 pumok, 시리즈 앞(구분)을 gubun
          const after = labelCells.find((l) => l.idx > seriesIdx);
          const before = labelCells.find((l) => l.idx < seriesIdx);
          if (after) currentPumok = after.text;
          else if (before) currentPumok = before.text; // 비고 빈 행 — 구분을 pumok으로
          if (before && after) currentGubun = before.text;
        }

        // 시리즈 셀 안의 링크들에 매핑
        const links = Array.from(seriesCellEl.querySelectorAll('a')).filter(isSeriesLink);
        for (const a of links) {
          // 동일 링크가 여러 행에서 잡힐 일은 거의 없지만, 처음 매칭만 유지
          if (!positionContext.has(a)) {
            positionContext.set(a, { pumok: currentPumok, gubun: currentGubun });
          }
        }
      }
    }

    // 모든 ?p= 또는 ?page_id= 링크 다 추출 (표 외부도 포함)
    const allLinks = Array.from(document.querySelectorAll('a')).filter(
      (a) => /[?&]p=\d+/.test(a.href) || /[?&]page_id=\d+/.test(a.href),
    );

    const seenIds = new Set();
    for (const a of allLinks) {
      const rawText = (a.textContent || '').trim();
      if (!rawText) continue;

      // 시스템 링크/안내 링크 제외
      if (/업데이트|매뉴얼|GPT|가이드|업데이트 요청/.test(rawText)) continue;
      if (/^(홈|이전|다음|편집|로그아웃)$/.test(rawText)) continue;

      const url = a.href;
      let pageId = 0;
      try {
        const u = new URL(url);
        pageId = parseInt(u.searchParams.get('p') || u.searchParams.get('page_id') || '0', 10);
      } catch { continue; }
      if (!pageId) continue;
      // 카테고리 메뉴 자체 제외 (리빙룸/다이닝룸 같은 카테고리 메뉴 링크)
      if (CATEGORY_PAGE_IDS.includes(pageId)) continue;

      // 시리즈명에서 라벨 분리
      let seriesName = rawText;
      let isOnlineOnly = false;
      let isDiscontinued = false;
      let isNew2025 = false;
      let isNew2026 = false;
      let isOldVersion = false;  // (구) 접두사
      let isNewVersion = false;  // (뉴) 접두사
      let labelExtra = '';

      // 잡문자 정제 — 일룸 사이트 표기에 가끔 붙는 |, ㅣ, 공백 (예: "스톤 |", "| 셀렉트")
      const cleanEdges = (s) =>
        s.replace(/^[|ㅣ\s]+/, '').replace(/[|ㅣ\s]+$/, '').trim();
      seriesName = cleanEdges(seriesName);

      // (구)/(뉴) 접두사 감지
      if (/^\s*\(구\)\s*/.test(seriesName)) {
        seriesName = seriesName.replace(/^\s*\(구\)\s*/, '').trim();
        isOldVersion = true;
        isDiscontinued = true; // 구버전은 단종 취급
      }
      if (/^\s*\(뉴\)\s*/.test(seriesName)) {
        seriesName = seriesName.replace(/^\s*\(뉴\)\s*/, '').trim();
        isNewVersion = true;
      }

      // (온) 라벨이 시리즈명 안에 있는 경우
      const onMatch = seriesName.match(/^(.+?)\s*\(온\)\s*$/);
      if (onMatch) {
        seriesName = onMatch[1].trim();
        isOnlineOnly = true;
      }

      // 시리즈명에 직접 "단종" 붙은 경우 (끝에 잡문자 더 있어도 처리)
      const dcMatch = seriesName.match(/^(.+?)단종\b/);
      if (dcMatch) {
        seriesName = cleanEdges(dcMatch[1]);
        isDiscontinued = true;
      }

      // 부모 요소에서 인접 텍스트로 라벨 추가 검색
      const parentHtml = a.parentElement?.innerHTML || '';
      const linkOuter = a.outerHTML;
      const afterLinkHtml = parentHtml.split(linkOuter)[1] || '';
      const afterText = afterLinkHtml.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').split('|')[0].trim();

      // "·"로 라벨 분리 (예: "2025·온" → ["2025", "온"])
      // 한국어 보조 기호도 처리 (·, ㆍ, /, 공백)
      const labelTokens = afterText.split(/[·ㆍ\/\s]+/).map((t) => t.trim()).filter(Boolean);

      for (const token of labelTokens) {
        if (/^단종$/.test(token)) isDiscontinued = true;
        if (/^온$/.test(token)) isOnlineOnly = true;
        if (/^2020$/.test(token)) {} // 단순 연도, 구버전 식별
        if (/^2021$/.test(token)) {} // 신버전 출시일
        if (/^2025$/.test(token)) isNew2025 = true;
        if (/^2026/.test(token)) isNew2026 = true;
        if (/가죽추가/.test(token)) {} // 별도 처리 필요시
      }
      labelExtra = afterText.slice(0, 50);

      // 색상으로 단종 추가 검증 (회색)
      const computedColor = window.getComputedStyle(a).color;
      const rgbMatch = computedColor.match(/\d+/g);
      if (rgbMatch && rgbMatch.length >= 3) {
        const [r, g, b] = rgbMatch.map(Number);
        // 회색 계열 (R≈G≈B 이고 100~180 범위)
        if (Math.abs(r - g) < 20 && Math.abs(g - b) < 20 && r > 100 && r < 200) {
          isDiscontinued = true;
        }
      }

      // 빈 시리즈명 제외
      if (!seriesName || seriesName.length < 1) continue;
      // 너무 긴 텍스트 (페이지 안내문 등) 제외
      if (seriesName.length > 30) continue;
      // 한 글자 시리즈명 제외 (P, 1 같은 잔여 텍스트)
      if (seriesName.length === 1) continue;
      // 순수 숫자 (2022, 2023, 1 등) 제외
      if (/^\d+$/.test(seriesName)) continue;
      // 날짜 형식 (26.04, 2026.04 등) 제외
      if (/^\d+\.\d+$/.test(seriesName) || /^\d{4}\.\d{1,2}\.\d{1,2}$/.test(seriesName)) continue;

      const ctx = positionContext.get(a) || { pumok: '', gubun: '' };

      // 쉼표 묶음 분리 — 괄호 밖의 쉼표만 (예: "오브, 오브플레인" → 두 시리즈)
      // 괄호 안 쉼표는 보호 (예: "키큰옷장(컬렉트,리디,스톤W)")
      function splitOutsideParens(s) {
        const parts = [];
        let depth = 0;
        let cur = '';
        for (const ch of s) {
          if (ch === '(' || ch === '[') { depth++; cur += ch; }
          else if (ch === ')' || ch === ']') { depth--; cur += ch; }
          else if (ch === ',' && depth === 0) {
            if (cur.trim()) parts.push(cur.trim());
            cur = '';
          } else cur += ch;
        }
        if (cur.trim()) parts.push(cur.trim());
        return parts;
      }
      const splitNames = splitOutsideParens(seriesName);
      const namesToAdd = splitNames.length > 1 ? splitNames : [seriesName];

      for (const finalName of namesToAdd) {
        // 같은 page_id + 시리즈명 중복 제외
        const key = `${pageId}|${finalName}`;
        if (seenIds.has(key)) continue;
        seenIds.add(key);

        result.push({
          series_name: finalName,
          url,
          page_id: pageId,
          pumok: ctx.pumok,
          gubun: ctx.gubun,
          label: labelExtra,
          is_discontinued: isDiscontinued,
          is_online_only: isOnlineOnly,
          is_new_2025: isNew2025,
          is_new_2026: isNew2026,
          is_old_version: isOldVersion,
          is_new_version: isNewVersion,
          // 챕터 자동 생성 대상 여부
          is_target: !isDiscontinued && !isOldVersion,
        });
      }
    }
    return result;
  }, Array.from(ALL_CATEGORY_IDS));

  // 라벨 정제 (&nbsp; 등)
  for (const s of seriesItems) {
    s.label = (s.label || '').replace(/&nbsp;/g, ' ').trim();
  }

  console.log(`   시리즈 ${seriesItems.length}개 발견 (단종 ${seriesItems.filter(s => s.is_discontinued).length}개 포함)`);
  for (const s of seriesItems) {
    allSeries.push({ category: cat.name, ...s });
  }
}

await browser.close();

// (R 리뉴얼 자동 감지는 케이스 다양해서 제거 — 볼케R/볼케S 같이 등급 구분도 있음.
//  사용자가 챕터 생성 단계에서 명시적으로 어떤 시리즈 처리할지 결정.)

// 3) 결과 저장
await fs.writeFile(path.join(OUT_DIR, 'catalog.json'), JSON.stringify(allSeries, null, 2), 'utf-8');

// 4) 통계
const byCategory = {};
const activeOnly = [];
const discontinued = [];
for (const s of allSeries) {
  byCategory[s.category] = (byCategory[s.category] || 0) + 1;
  if (s.is_discontinued) discontinued.push(s);
  else activeOnly.push(s);
}

console.log('\n========== 요약 ==========');
console.log(`총 시리즈: ${allSeries.length}개`);
console.log(`판매중: ${activeOnly.length}개`);
console.log(`단종: ${discontinued.length}개`);
console.log('\n카테고리별:');
for (const [cat, count] of Object.entries(byCategory)) {
  console.log(`  ${cat}: ${count}개`);
}

console.log('\n판매중인 시리즈 샘플 (처음 20개):');
for (const s of activeOnly.slice(0, 20)) {
  console.log(`  [${s.category}] ${s.pumok} > ${s.gubun} > ${s.series_name} (p=${s.page_id})${s.label ? ' [' + s.label + ']' : ''}`);
}

console.log(`\n✅ 저장: ${path.join(OUT_DIR, 'catalog.json')}`);
