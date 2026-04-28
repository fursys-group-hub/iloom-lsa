// 단일 시리즈 챕터 자동 생성 (사양 자동 채움 + 영업 노하우 placeholder)
// 사용법: node scripts/textbook/generate-chapter.mjs <시리즈명> [--dry-run]
// 예: node scripts/textbook/generate-chapter.mjs 로이
//
// 흐름:
// 1. collect-series-data 결과 활용 (없으면 자동 호출)
// 2. 코펜하겐 챕터 구조 따라 HTML 자동 채우기
//    - 자동: 헤더/sub-품목/단품 표/색상/사이즈/단종 알림
//    - placeholder: 영업 노하우 영역 (Claude 추가 작성용)
// 3. textbook_chapters upsert (status='draft')
//
// 후속:
// - 이미지 다운로드 + Storage 업로드은 별도 download-images.mjs로
// - 영업 노하우는 Claude가 일지 보고 직접 추가 작성

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import fs from 'fs/promises';
import path from 'path';
import { execSync } from 'child_process';

config({ path: '.env.local' });

const args = process.argv.slice(2);
const DRY = args.includes('--dry-run');
const seriesName = args.filter((a) => !a.startsWith('--'))[0];
if (!seriesName) {
  console.error('사용법: node scripts/textbook/generate-chapter.mjs <시리즈명> [--dry-run]');
  process.exit(1);
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const OUT_DIR = path.resolve('scripts/textbook/output', `series-${seriesName}`);
const DATA_FILE = path.join(OUT_DIR, 'all-data.json');

// 1) 데이터 수집 (없으면 collect-series-data 호출)
let data;
try {
  data = JSON.parse(await fs.readFile(DATA_FILE, 'utf-8'));
  console.log(`✓ 기존 데이터 사용: ${DATA_FILE}`);
} catch {
  console.log('데이터 없음 — collect-series-data 호출 중...');
  execSync(`node scripts/textbook/collect-series-data.mjs ${seriesName}`, { stdio: 'inherit' });
  data = JSON.parse(await fs.readFile(DATA_FILE, 'utf-8'));
}

// 2) HTML 생성
function escape(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function renderHeader() {
  const cards = data.catalog_cards;
  const cats = [...new Set(cards.map((c) => c.category))];
  const pumoks = [...new Set(cards.map((c) => `${c.category}/${c.pumok}${c.gubun ? '·' + c.gubun : ''}`))];
  return `
<section>
  <h2>📋 기본 정보</h2>
  <table>
    <tr><th>시리즈명</th><td><strong>${escape(data.series_name)}</strong>${data.aliases.length > 1 ? ` <em>(별칭: ${escape(data.aliases.slice(1).join(', '))})</em>` : ''}</td></tr>
    <tr><th>카테고리</th><td>${escape(cats.join(', '))}</td></tr>
    <tr><th>품목 분류</th><td>${pumoks.map(escape).join('<br>')}</td></tr>
    <tr><th>관련 단품 수</th><td><strong>${data.set_master.length}</strong>개 (세트마스터 기준)</td></tr>
    <tr><th>학생 일지</th><td><strong>${data.notes_count}</strong>건 누적</td></tr>
  </table>
</section>`;
}

function renderSubPages() {
  const allSubs = data.product_guides.flatMap((g) => g.sub_pages || []).filter((sp) => !/단종/.test(sp.title));
  if (allSubs.length === 0) return '';
  return `
<section>
  <h2>🛋️ 시리즈 라인업 (sub-품목)</h2>
  <p>이 시리즈는 다음 ${allSubs.length}개 품목으로 구성됩니다:</p>
  <ul>
${allSubs.map((sp) => `    <li><a href="${escape(sp.url)}" target="_blank">${escape(sp.title)}</a></li>`).join('\n')}
  </ul>
</section>`;
}

function renderSetMaster() {
  if (data.set_master.length === 0) return '';
  // 품목군별 그룹핑
  const byPumok = {};
  for (const s of data.set_master) {
    const p = s.pumok_name || '(미분류)';
    if (!byPumok[p]) byPumok[p] = [];
    byPumok[p].push(s);
  }
  let html = `
<section>
  <h2>📦 세트마스터 (단품 정보)</h2>`;
  for (const pumok of Object.keys(byPumok)) {
    const sets = byPumok[pumok];
    // 색상 unique
    const colors = [...new Set(sets.map((s) => s.set_color).filter(Boolean))];
    // 채널
    const channels = [...new Set(sets.map((s) => s.channel_name).filter(Boolean))];
    html += `
  <h3>${escape(pumok)} <small>(${sets.length}개 단품)</small></h3>
  <p><strong>색상:</strong> ${colors.length > 0 ? colors.map(escape).join(' / ') : '-'} <br>
     <strong>판매채널:</strong> ${channels.map(escape).join(' / ')}</p>
  <details>
    <summary>단품 ${sets.length}개 펼치기</summary>
    <table>
      <thead><tr><th>세트코드</th><th>색상</th><th>명칭</th><th>규격</th><th>채널</th></tr></thead>
      <tbody>
${sets.slice(0, 50).map((s) => `        <tr><td><code>${escape(s.set_code)}</code></td><td>${escape(s.set_color)}</td><td>${escape(s.set_name)}</td><td>${escape(s.size_detail || '-')}</td><td>${escape(s.channel_name || '-')}</td></tr>`).join('\n')}
${sets.length > 50 ? `        <tr><td colspan="5"><em>... 외 ${sets.length - 50}개 (펼쳐서 일부만 표시)</em></td></tr>` : ''}
      </tbody>
    </table>
  </details>`;
  }
  return html + '\n</section>';
}

function renderProductGuide() {
  if (data.product_guides.length === 0) return '';
  // 일룸 가이드 사이트 링크만 (raw text dump 제거 — 내부 이력/색상 코드만 등 학생 학습에 무의미)
  let html = `
<section>
  <h2>📖 일룸 가이드 사이트</h2>
  <p>제품 사양·색상·사이즈 등 공식 정보는 아래 링크에서 확인:</p>
  <ul>`;
  for (const g of data.product_guides) {
    html += `\n    <li><a href="${escape(g.url)}" target="_blank">${escape(g.series_name)} 페이지 ↗</a> <small>(p=${g.page_id})</small></li>`;
  }
  return html + '\n  </ul>\n</section>';
}

function renderNotesPool() {
  if (data.notes.length === 0) return '';
  // 일지 본문에서 시리즈 등장 부분만 발췌
  const sortedNotes = [...data.notes].sort((a, b) => (b.excerpts?.length || 0) - (a.excerpts?.length || 0));
  let html = `
<section>
  <h2>📝 학생 일지 풀 (영업 노하우 작성 자료)</h2>
  <p>아래 ${data.notes.length}건의 일지에서 매장 실전 팁·깨달음·고객 페르소나를 추출하세요.</p>
  <details>
    <summary><strong>${data.notes.length}건 일지 발췌 펼치기</strong> (긴 발췌 순)</summary>`;
  for (const n of sortedNotes.slice(0, 30)) {
    html += `
    <blockquote style="border-left:3px solid #3B82F6;padding:8px 12px;margin:8px 0;background:#F8FAFF;">
      <cite style="font-size:12px;color:#6B7280;">${escape(n.student)}, ${escape(n.batch)}·${escape(n.date || '')}</cite>
${(n.excerpts || []).map((e) => `      <p style="margin:6px 0;font-size:14px;">${escape(e.slice(0, 300))}</p>`).join('\n')}
    </blockquote>`;
  }
  return html + `
${data.notes.length > 30 ? `<p><em>... 외 ${data.notes.length - 30}건 (전체는 collect-series-data JSON 파일에 있음)</em></p>` : ''}
  </details>
</section>`;
}

function renderPlaceholder() {
  return `
<section style="background:#FEF9C3;border:2px dashed #EAB308;padding:20px;border-radius:8px;margin:24px 0;">
  <h2 style="margin-top:0;">✏️ 영업 노하우 — Claude 추가 작성 영역</h2>
  <p>아래 섹션은 Claude가 학생 일지를 분석해서 직접 작성합니다 (현재는 placeholder).</p>
  <ul>
    <li><strong>⭐ 제품 특장점</strong> — 한 문장 정의 / 영업 멘트 예시 / 페르소나</li>
    <li><strong>💡 매장 실전 팁</strong> — 일지 인용 + 매장 응대 노하우</li>
    <li><strong>🎓 학생 깨달음 사례</strong> — 인상 깊은 학생 회고</li>
    <li><strong>🚨 매장 영업 필수 안내</strong> — 클레임 예방용 (있을 경우)</li>
  </ul>
  <p><em>일지 풀(아래 섹션)에서 매장 응대·고객 사례·학생 깨달음을 추출해 작성하세요.</em></p>
</section>`;
}

const html = `<style>
.tb-chapter { font-family: 'Pretendard', sans-serif; line-height: 1.6; }
.tb-chapter table { width: 100%; border-collapse: collapse; margin: 12px 0 16px; font-size: 14px; }
.tb-chapter th, .tb-chapter td { border: 1px solid #D1D5DB; padding: 10px 14px; text-align: left; vertical-align: top; }
.tb-chapter th { background: #F3F4F6; font-weight: 600; }
.tb-chapter h2 { font-size: 20px; font-weight: 700; margin: 24px 0 12px; padding-bottom: 8px; border-bottom: 2px solid #1C1C1E; }
.tb-chapter h3 { font-size: 16px; font-weight: 700; margin: 16px 0 6px; }
.tb-chapter section { margin-bottom: 32px; }
.tb-chapter ul { padding-left: 24px; }
.tb-chapter li { margin: 4px 0; }
.tb-chapter blockquote { margin: 12px 0; padding: 14px 18px; background: #F7F8FA; border-left: 3px solid #3B82F6; border-radius: 4px; }
.tb-chapter cite { color: #6B7280; font-size: 13px; font-style: normal; }
.tb-chapter details { margin: 12px 0; }
.tb-chapter summary { cursor: pointer; padding: 6px 0; font-weight: 500; }
.tb-chapter code { background: #F3F4F6; padding: 1px 4px; border-radius: 3px; font-family: 'D2Coding', monospace; font-size: 12px; }
</style>
<div class="tb-chapter">
${renderHeader()}
${renderPlaceholder()}
${renderSubPages()}
${renderSetMaster()}
${renderProductGuide()}
${renderNotesPool()}
</div>`;

// 결과 저장 (디버그용 로컬)
const htmlFile = path.join(OUT_DIR, 'chapter-auto.html');
await fs.writeFile(htmlFile, html, 'utf-8');
const sizeKB = (Buffer.byteLength(html) / 1024).toFixed(1);
console.log(`\n✅ HTML 생성: ${htmlFile} (${sizeKB}KB)`);

// 카탈로그에서 카테고리 가져오기
const category = data.catalog_cards[0]?.category || null;

// DB upsert
if (DRY) {
  console.log('\n[DRY-RUN] DB 저장 안 함');
} else {
  const { error } = await supabase
    .from('textbook_chapters')
    .upsert(
      {
        series_name: seriesName,
        category,
        html_content: html,
        status: 'draft',
        source_note_ids: data.notes.map((n) => n.id),
        source_pptx_ids: [],
        generated_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'series_name' }
    );
  if (error) {
    console.error('❌ DB 저장 실패:', error.message);
    process.exit(1);
  }
  console.log(`✅ DB 저장: textbook_chapters [${seriesName}] status=draft`);
}

console.log(`\n다음 단계:`);
console.log(`  1. /dashboard/textbook/${encodeURIComponent(seriesName)} 에서 검수`);
console.log(`  2. Claude가 영업 노하우 영역(노란 박스) 추가 작성 — 일지 풀 활용`);
