// 단일 시리즈 챕터 자동 생성 — 코펜하겐 8섹션 구조 sceleton
// 사용법: node scripts/textbook/generate-chapter.mjs <시리즈명> [--dry-run]
// 예: node scripts/textbook/generate-chapter.mjs 로이
//
// 코펜하겐 챕터(기준 모델) 8섹션:
// 1. 📋 기본 정보 — 자동
// 2. ⭐ 제품 특장점 — Claude 작성 (placeholder + 자료 풀)
// 3. 💡 매장 실전 팁 — Claude 작성 (placeholder + 일지 발췌)
// 4. 🎓 학생 깨달음 사례 — Claude 작성 (placeholder + 일지 발췌)
// 5. 🪑 운영 라인업 (단품 코드 + 사이즈) — 자동 (세트마스터)
// 6. 🎨 마감재 / 색상 옵션 — 자동 (세트마스터 색상 코드)
// 7. 🔧 소재 / 내장재 — Claude 작성 (placeholder + PPTX 발췌)
// 8. 📐 사이즈 도면 — placeholder (이미지는 별도 처리)
//
// 흐름: collect-series-data.mjs → all-data.json → 이 스크립트 → DB upsert

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

let data;
try {
  data = JSON.parse(await fs.readFile(DATA_FILE, 'utf-8'));
  console.log(`✓ 기존 데이터 사용: ${DATA_FILE}`);
} catch {
  console.log('데이터 없음 — collect-series-data 호출 중...');
  execSync(`node scripts/textbook/collect-series-data.mjs ${seriesName}`, { stdio: 'inherit' });
  data = JSON.parse(await fs.readFile(DATA_FILE, 'utf-8'));
}

function escape(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ═══ 섹션 1: 📋 기본 정보 (자동) ═══
function section1_basicInfo() {
  const cards = data.catalog_cards;
  const cats = [...new Set(cards.map((c) => c.category))];
  const pumoks = [...new Set(cards.map((c) => c.pumok).filter(Boolean))];
  const onlineFlag = cards.some((c) => c.is_online_only);
  return `
<section class="basic-info">
  <h2>📋 기본 정보</h2>
  <table>
    <tr><th>모델명</th><td><strong>${escape(data.series_name)}</strong>${onlineFlag ? ' <span style="color:#A855F7;font-size:13px;">(온라인 전용)</span>' : ''}</td></tr>
    <tr><th>카테고리</th><td>${escape(cats.join(' / '))}</td></tr>
    <tr><th>품목 분류</th><td>${escape(pumoks.join(' / '))}</td></tr>
    <tr><th>관련 단품</th><td><strong>${data.set_master.length}</strong>개 (세트마스터 기준)</td></tr>
    <tr><th>학생 일지</th><td><strong>${data.notes_count}</strong>건 누적 학습 기록</td></tr>
    <tr><th>가이드 사이트</th><td>${data.product_guides.map((g) => `<a href="${escape(g.url)}" target="_blank">${escape(g.series_name)} 페이지 ↗</a>`).join(' / ')}</td></tr>
  </table>
</section>`;
}

// ═══ 섹션 2: ⭐ 제품 특장점 (Claude placeholder) ═══
function section2_features() {
  return `
<section class="features">
  <h2>⭐ 제품 특장점</h2>

  <div class="claude-todo">
    <strong>✏️ Claude 작성 영역</strong> — 일지·PPTX·가이드 분석해서 다음 항목 작성:
    <ul>
      <li>📌 <strong>한 문장으로 ${escape(data.series_name)}</strong> (제품 정체성 압축)</li>
      <li>🎨 <strong>디자인 분석</strong> — 구조 → 효과 표 (왜 이 디자인이 ㅇㅇ한 효과를 주는지)</li>
      <li>🛋️ <strong>착좌감 / 사용감</strong></li>
      <li>🌟 <strong>다른 시리즈와의 결정적 차이</strong></li>
      <li>💡 <strong>영업 멘트 예시</strong> (노란 박스)</li>
      <li>👥 <strong>추천 고객 페르소나</strong> (표)</li>
    </ul>
  </div>
</section>`;
}

// ═══ 섹션 3: 💡 매장 실전 팁 (Claude placeholder + 일지 발췌) ═══
function section3_storeTips() {
  const sortedNotes = [...data.notes].sort((a, b) => (b.excerpts?.length || 0) - (a.excerpts?.length || 0));
  const top10 = sortedNotes.slice(0, 10);
  return `
<section class="store-tips">
  <h2>💡 매장 실전 팁</h2>

  <div class="claude-todo">
    <strong>✏️ Claude 작성 영역</strong> — 아래 일지에서 매장 응대·고객 사례·실수 회피 노하우 추출
  </div>

  <details>
    <summary><strong>📝 학생 일지 발췌 ${data.notes_count}건 펼치기</strong> (긴 발췌 순)</summary>
${top10.map((n) => `
    <blockquote>
      <cite>${escape(n.student)}, ${escape(n.batch)}·${escape(n.date || '')}</cite>
${(n.excerpts || []).slice(0, 2).map((e) => `      <p>${escape(e.slice(0, 250))}</p>`).join('\n')}
    </blockquote>`).join('')}
${data.notes.length > 10 ? `<p><em>외 ${data.notes.length - 10}건은 all-data.json 파일 참고</em></p>` : ''}
  </details>
</section>`;
}

// ═══ 섹션 4: 🎓 학생 깨달음 사례 (Claude placeholder) ═══
function section4_studentInsights() {
  return `
<section class="student-insights">
  <h2>🎓 학생 깨달음 사례</h2>

  <div class="claude-todo">
    <strong>✏️ Claude 작성 영역</strong> — 일지에서 인상 깊은 학생 회고 / 깨달음 추출
    <p style="margin:8px 0;font-size:13px;color:#6B7280;">예: "처음엔 ㅇㅇ인 줄 알았는데 알고 보니 △△ 였다", "고객 반응이 □□일 줄 몰랐다"</p>
  </div>
</section>`;
}

// ═══ 섹션 구분선 ═══
function divider() {
  return `\n<div class="section-divider">─── 사양 정보 (Reference) ───</div>\n`;
}

// ═══ 섹션 5: 🪑 운영 라인업 (자동 — 세트마스터) ═══
function section5_lineup() {
  if (data.set_master.length === 0) return '';
  const byPumok = {};
  for (const s of data.set_master) {
    const p = s.pumok_name || '(미분류)';
    if (!byPumok[p]) byPumok[p] = [];
    byPumok[p].push(s);
  }
  let html = `
<section class="lineup">
  <h2>🪑 운영 라인업 (단품 코드 + 사이즈)</h2>`;
  for (const pumok of Object.keys(byPumok)) {
    const sets = byPumok[pumok];
    html += `
  <h3>${escape(pumok)} <small style="color:#6B7280;font-weight:400;">(${sets.length}개 단품)</small></h3>
  <details>
    <summary>단품 ${sets.length}개 펼치기</summary>
    <table>
      <thead><tr><th>세트코드</th><th>색상</th><th>명칭</th><th>규격(W×D×H)</th><th>채널</th></tr></thead>
      <tbody>
${sets.slice(0, 60).map((s) => `        <tr><td><code>${escape(s.set_code)}</code></td><td>${escape(s.set_color)}</td><td>${escape(s.set_name)}</td><td>${escape(s.size_detail || '-')}</td><td>${escape(s.channel_name || '-')}</td></tr>`).join('\n')}
${sets.length > 60 ? `        <tr><td colspan="5"><em>... 외 ${sets.length - 60}개</em></td></tr>` : ''}
      </tbody>
    </table>
  </details>`;
  }
  return html + '\n</section>';
}

// ═══ 섹션 6: 🎨 색상 옵션 (자동 — 세트마스터 색상 코드) ═══
function section6_colors() {
  const colors = [...new Set(data.set_master.map((s) => s.set_color).filter(Boolean))];
  if (colors.length === 0) return '';
  return `
<section class="colors">
  <h2>🎨 마감재 / 색상 옵션</h2>
  <p>세트마스터 기준 ${colors.length}개 색상 코드:</p>
  <p style="background:#FAFBFC;padding:12px;border-radius:6px;font-family:monospace;font-size:13px;">
    ${colors.map((c) => `<span style="display:inline-block;background:#fff;border:1px solid #D1D5DB;padding:3px 8px;border-radius:4px;margin:2px;">${escape(c)}</span>`).join(' ')}
  </p>

  <div class="claude-todo">
    <strong>✏️ Claude 작성 영역</strong> — 색상 칩 이미지 + 한국어 색상명 매칭 (가이드 이미지 활용)
    <p style="margin:8px 0;font-size:13px;color:#6B7280;">예: L840 = 블랑(BLANC), 4L0 = 샤모아(CHAMOIS) — 색상 칩 + 한·영 색상명 표</p>
  </div>
</section>`;
}

// ═══ 섹션 7: 🔧 소재 / 내장재 (Claude placeholder + PPTX 발췌) ═══
function section7_materials() {
  const slides = data.pptx_slides || [];
  return `
<section class="materials">
  <h2>🔧 소재 / 내장재</h2>

  <div class="claude-todo">
    <strong>✏️ Claude 작성 영역</strong> — PPTX 자료 분석해 소재·내장재 정리
  </div>

  ${slides.length > 0 ? `
  <details>
    <summary><strong>📚 일룸 PPTX 자료에서 ${slides.length}장 매칭됨</strong> (시리즈명 등장 슬라이드)</summary>
${slides.slice(0, 8).map((s) => `
    <div style="background:#FAFBFC;border:1px solid #E5E7EB;padding:10px 14px;border-radius:6px;margin:8px 0;">
      <p style="font-size:12px;color:#6B7280;margin:0 0 6px;">${escape(s.file)} <strong>슬라이드 ${s.slide_no}</strong>: ${escape(s.title)}</p>
      <pre style="white-space:pre-wrap;font-size:13px;margin:0;">${escape(s.text.slice(0, 800))}</pre>
    </div>`).join('')}
${slides.length > 8 ? `<p><em>외 ${slides.length - 8}장은 all-data.json 참고</em></p>` : ''}
  </details>` : ''}
</section>`;
}

// ═══ 섹션 8: 📐 사이즈 도면 (placeholder) ═══
function section8_dimensions() {
  return `
<section class="dimensions">
  <h2>📐 사이즈 도면</h2>

  <div class="claude-todo">
    <strong>✏️ Claude 작성 영역</strong> — 가이드 사이트 도면 이미지 + 사이즈 표
    <p style="margin:8px 0;font-size:13px;color:#6B7280;">download-images.mjs로 도면 이미지 다운로드 + Storage 업로드 후 삽입</p>
  </div>
</section>`;
}

// ═══ 전체 HTML ═══
const styles = `<style>
.tb-chapter { font-family: 'Pretendard', -apple-system, sans-serif; line-height: 1.6; }
.tb-chapter table { width: 100%; border-collapse: collapse; margin: 12px 0 16px; font-size: 14px; }
.tb-chapter th, .tb-chapter td { border: 1px solid #D1D5DB; padding: 10px 14px; text-align: left; vertical-align: top; line-height: 1.5; }
.tb-chapter th { background: #F3F4F6; font-weight: 600; color: #1F2937; white-space: nowrap; width: 140px; }
.tb-chapter thead th { white-space: normal; width: auto; background: #E5E7EB; }
.tb-chapter section { margin-bottom: 32px; }
.tb-chapter h2 { font-size: 20px; font-weight: 700; margin: 24px 0 12px; padding-bottom: 8px; border-bottom: 2px solid #1C1C1E; }
.tb-chapter h3 { font-size: 15px; font-weight: 700; margin: 16px 0 6px; color: #1F2937; }
.tb-chapter ul { padding-left: 24px; margin: 8px 0; }
.tb-chapter li { margin: 6px 0; line-height: 1.6; }
.tb-chapter blockquote { margin: 12px 0; padding: 14px 18px; background: #F7F8FA; border-left: 3px solid #3B82F6; border-radius: 4px; font-style: italic; }
.tb-chapter cite { color: #6B7280; font-size: 13px; font-style: normal; margin-left: 6px; font-weight: 400; display: inline-block; }
.tb-chapter details { margin: 12px 0; }
.tb-chapter summary { cursor: pointer; padding: 6px 0; font-weight: 500; }
.tb-chapter code { background: #F3F4F6; padding: 1px 4px; border-radius: 3px; font-family: 'D2Coding', monospace; font-size: 12px; }
.tb-chapter .claude-todo { background: #FEF9C3; border: 2px dashed #EAB308; padding: 14px 16px; border-radius: 8px; margin: 12px 0; font-size: 14px; }
.tb-chapter .claude-todo strong { color: #92400E; }
.tb-chapter .section-divider { margin: 48px 0 24px; padding: 12px 16px; background: #F3F4F6; border-radius: 6px; text-align: center; font-size: 13px; font-weight: 700; color: #6B7280; letter-spacing: 0.08em; }
</style>`;

const html = `${styles}
<div class="tb-chapter">
${section1_basicInfo()}
${section2_features()}
${section3_storeTips()}
${section4_studentInsights()}
${divider()}
${section5_lineup()}
${section6_colors()}
${section7_materials()}
${section8_dimensions()}
</div>`;

// 결과 저장
const htmlFile = path.join(OUT_DIR, 'chapter-auto.html');
await fs.writeFile(htmlFile, html, 'utf-8');
const sizeKB = (Buffer.byteLength(html) / 1024).toFixed(1);
console.log(`\n✅ HTML 생성: ${htmlFile} (${sizeKB}KB)`);

const category = data.catalog_cards[0]?.category || null;

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
console.log(`  1. /dashboard/textbook/${encodeURIComponent(seriesName)} 검수`);
console.log(`  2. Claude가 8섹션의 ✏️ 노란 박스 영역 채워나감 (일지·PPTX 분석)`);
console.log(`  3. download-images.mjs로 색상 칩·도면 이미지 추가`);
