// 단일 시리즈 챕터 자동 생성 — 코펜하겐 chapter.html 그대로 따른 템플릿
// 사용법: node scripts/textbook/generate-chapter.mjs <시리즈명> [--dry-run]
//
// 정책: 코펜하겐 HTML 구조 그대로 + 자동 가능한 데이터만 채움 + 나머지는 빈 td (Claude 추후 작성)
// 자동 채움: 모델명, 카테고리, 관련 단품, 학생 일지 / 단품 표 / 색상 코드+매칭
// Claude 작성: 컨셉, 구성, 마감재, 차별 포인트, 타겟 고객, 착좌감, 매장 영업 필수 안내,
//              제품 특장점, 매장 실전 팁, 학생 깨달음, 사이즈 도면

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
} catch {
  console.log('데이터 없음 — collect-series-data 호출 중...');
  execSync(`node scripts/textbook/collect-series-data.mjs ${JSON.stringify(seriesName)}`, { stdio: 'pipe' });
  data = JSON.parse(await fs.readFile(DATA_FILE, 'utf-8'));
}

function escape(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// 빈 셀 마커 (Claude 추후 작성)
const EMPTY = '<em style="color:#9CA3AF;">—</em>';

// 가이드 5탭에서 색상 코드 + 색상명 자동 매칭 (3줄 패턴: 코드 + 한국어 + 영어)
// 예: "L849L 피오니 PEONY" 또는 줄바꿈 분리
function extractColorMap() {
  const map = {};
  const validCodes = new Set(data.set_master.map((s) => s.set_color).filter(Boolean));
  for (const g of data.product_guides) {
    for (const tabKey of ['tab1', 'tab2', 'tab3', 'tab4', 'tab5']) {
      const tab = g[tabKey];
      if (!tab?.text) continue;
      const lines = tab.text.split('\n').map((l) => l.trim()).filter(Boolean);
      for (let i = 0; i < lines.length; i++) {
        // 패턴 A: 한 줄에 "코드 한국어 영어" 모두 (예: "L849L 피오니 PEONY")
        const inlineMatch = lines[i].match(/^([A-Z0-9]{2,6})\s+([가-힣\s]{2,15})\s+([A-Z][A-Z\s]+)$/);
        if (inlineMatch && validCodes.has(inlineMatch[1])) {
          const code = inlineMatch[1];
          const ko = inlineMatch[2].trim();
          const en = inlineMatch[3].trim();
          if (!map[code]) map[code] = [];
          if (!map[code].includes(`${ko} (${en})`)) map[code].push(`${ko} (${en})`);
          continue;
        }
        // 패턴 B: 줄 단위 (코드 / 한국어 / 영어 각 줄)
        const code = lines[i];
        if (!validCodes.has(code)) continue;
        const next = lines[i + 1];
        const next2 = lines[i + 2];
        const isHangul = (s) => s && /[가-힣]/.test(s) && !/^[A-Z0-9]{2,4}$/.test(s) && s.length <= 30;
        const isEng = (s) => s && /^[A-Z][A-Z\s]+$/.test(s);
        if (isHangul(next) && isEng(next2)) {
          if (!map[code]) map[code] = [];
          const v = `${next} (${next2})`;
          if (!map[code].includes(v)) map[code].push(v);
        } else if (next && !/^[A-Z0-9]{2,4}$/.test(next) && /[가-힣A-Za-z]/.test(next) && next.length <= 40) {
          if (!map[code]) map[code] = [];
          if (!map[code].includes(next)) map[code].push(next);
        }
      }
    }
  }
  return map;
}

// 가이드 tab1에서 "타겟 및 기획의도" 섹션 발췌
function extractGuideTarget() {
  for (const g of data.product_guides) {
    const text = g.tab1?.text || '';
    const m = text.match(/타겟[\s·및]+기획의도\s*\n([\s\S]+?)(?=\n색상|\n품목리스트|\n페이지\n|\n타겟)/);
    if (m) return m[1].trim().slice(0, 1000);
  }
  return null;
}

// 가이드 tab1 "품목리스트" 섹션에서 구성 추출 (3인/4인/카우치/코너형 같은 라인업)
function extractComposition() {
  for (const g of data.product_guides) {
    const text = g.tab1?.text || '';
    const m = text.match(/품목리스트\s*\n([\s\S]+?)(?=\n페이지|\n타겟|$)/);
    if (!m) continue;
    const block = m[1];
    // 줄 단위로 모델명 패턴 추출 (예: "코펜하겐 3인(가죽) (HCC713)")
    const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
    const items = [];
    for (const line of lines) {
      // 시리즈명 포함 + 한글/영문 + 괄호 코드
      if (data.aliases.some((a) => line.includes(a)) && /\([A-Z0-9/]+\)/.test(line)) {
        items.push(line);
      }
    }
    if (items.length > 0) return items.slice(0, 20);
  }
  return [];
}

// ═══ 섹션 1: 📋 기본 정보 (코펜하겐 표 구조 그대로 + 자동 채움) ═══
function section1() {
  const cards = data.catalog_cards;
  const cats = [...new Set(cards.map((c) => c.category))];
  const pumoks = [...new Set(cards.map((c) => c.pumok).filter(Boolean))];
  const onlineFlag = cards.some((c) => c.is_online_only);
  const categoryDisp = `${cats.join(' / ')}${pumoks.length > 0 ? ' / ' + pumoks.join(' / ') : ''}`;
  const guideTarget = extractGuideTarget();
  const composition = extractComposition();
  // 컨셉: 타겟 및 기획의도 첫 줄~첫 단락 (1~3문장)
  let conceptAuto = '';
  if (guideTarget) {
    const firstParas = guideTarget.split(/\n\n+/).filter((p) => p.trim().length > 10);
    conceptAuto = firstParas[0] || '';
    if (conceptAuto.length > 300) conceptAuto = conceptAuto.slice(0, 300) + '...';
  }
  return `
<section class="basic-info">
  <h2>📋 기본 정보</h2>
  <table>
    <tr><th>모델명</th><td><strong>${escape(data.series_name)}</strong>${onlineFlag ? ' <span style="color:#A855F7;font-size:13px;">(온라인 전용)</span>' : ''}</td></tr>
    <tr><th>카테고리</th><td>${escape(categoryDisp)}</td></tr>
    <tr><th>컨셉 / 기획의도</th><td>${conceptAuto ? `<span style="color:#374151;">${escape(conceptAuto)}</span><br><small style="color:#9CA3AF;">— 일룸 가이드 타겟·기획의도 자동 발췌</small>` : EMPTY}</td></tr>
    <tr><th>구성 (라인업)</th><td>${composition.length > 0 ? `<ul style="margin:0;padding-left:20px;">${composition.slice(0, 12).map((c) => `<li style="font-size:13px;">${escape(c)}</li>`).join('')}</ul>` : EMPTY}</td></tr>
    <tr><th>마감재</th><td>${EMPTY} <em style="color:#9CA3AF;font-size:13px;">(가이드·PPTX 분석 — Claude 정리)</em></td></tr>
    <tr><th>차별 포인트</th><td>${EMPTY} <em style="color:#9CA3AF;font-size:13px;">(시리즈 비교 — Claude 작성)</em></td></tr>
    <tr><th>타겟 고객</th><td>${EMPTY} <em style="color:#9CA3AF;font-size:13px;">(컨셉/기획의도에서 Claude 압축)</em></td></tr>
    <tr><th>착좌감 / 사용감</th><td>${EMPTY} <em style="color:#9CA3AF;font-size:13px;">(가이드·일지 — Claude 작성)</em></td></tr>
    <tr><th>관련 단품</th><td>${data.set_master.length}개 (세트마스터)</td></tr>
    <tr><th>학생 일지</th><td>${data.notes_count}건 누적</td></tr>
    <tr><th>가이드 사이트</th><td>${data.product_guides.map((g) => `<a href="${escape(g.url)}" target="_blank">${escape(g.series_name)} ↗</a>`).join(' / ') || '-'}</td></tr>
  </table>

  ${guideTarget ? `
  <details style="margin-top:12px;">
    <summary style="color:#3B82F6;font-weight:600;">📖 가이드 "타겟·기획의도" 전체 (${guideTarget.length}자)</summary>
    <pre style="white-space:pre-wrap;font-size:13px;background:#FAFBFC;padding:12px;border-radius:6px;margin-top:8px;">${escape(guideTarget)}</pre>
  </details>` : ''}

  <p class="alert-note" style="background:#FEF2F2;border-left:3px solid #EF4444;padding:12px 16px;border-radius:4px;margin-top:16px;color:#991B1B;">
    <strong>🚨 매장 영업 필수 안내 사항</strong><br/>
    ${EMPTY} <em style="color:#9CA3AF;font-size:13px;">(클레임 예방 안내 — Claude 추후 작성)</em>
  </p>
</section>`;
}

// ═══ 섹션 2: ⭐ 제품 특장점 ═══
function section2() {
  return `
<section class="features">
  <h2>⭐ 제품 특장점</h2>

  <h3 style="font-size:15px;margin-top:12px;">📌 한 문장으로 ${escape(data.series_name)}</h3>
  <p style="font-size:15px;line-height:1.7;background:#F0F9FF;border-left:3px solid #3B82F6;padding:12px 16px;border-radius:4px;margin:8px 0;">
    ${EMPTY}
  </p>

  <h3 style="font-size:15px;margin-top:20px;">🎨 디자인 분석 — 구조 → 효과</h3>
  <table>
    <thead><tr><th style="width:20%;">구조</th><th style="width:35%;">설명</th><th style="width:45%;">고객이 느끼는 효과</th></tr></thead>
    <tbody>
      <tr><td>${EMPTY}</td><td>${EMPTY}</td><td>${EMPTY}</td></tr>
      <tr><td>${EMPTY}</td><td>${EMPTY}</td><td>${EMPTY}</td></tr>
      <tr><td>${EMPTY}</td><td>${EMPTY}</td><td>${EMPTY}</td></tr>
    </tbody>
  </table>

  <p style="background:#FEF3C7;border-left:3px solid #F59E0B;padding:10px 14px;border-radius:4px;margin:12px 0;font-size:14px;">
    💡 <strong>영업 멘트 예시</strong>: ${EMPTY}
  </p>

  <h3 style="font-size:15px;margin-top:24px;">🛋️ 착좌감 / 사용감</h3>
  <p style="font-size:14px;line-height:1.7;background:#FAFBFC;border:1px solid #E5E7EB;padding:12px 16px;border-radius:6px;">${EMPTY}</p>

  <h3 style="font-size:15px;margin-top:24px;">🌟 다른 시리즈와의 결정적 차이</h3>
  <ul><li>${EMPTY}</li></ul>

  <h3 style="font-size:15px;margin-top:24px;">👥 추천 고객 페르소나</h3>
  <table>
    <thead><tr><th>고객 유형</th><th>이유</th></tr></thead>
    <tbody><tr><td>${EMPTY}</td><td>${EMPTY}</td></tr></tbody>
  </table>
</section>`;
}

// ═══ 섹션 3: 💡 매장 실전 팁 ═══
function section3() {
  const sortedNotes = [...data.notes].sort((a, b) => (b.excerpts?.length || 0) - (a.excerpts?.length || 0));
  const top10 = sortedNotes.slice(0, 10);
  return `
<section class="store-tips">
  <h2>💡 매장 실전 팁</h2>

  <p style="color:#6B7280;font-size:14px;">${EMPTY} <em style="color:#9CA3AF;font-size:13px;">(아래 일지 발췌에서 매장 응대·고객 사례·실수 회피 노하우 추출 — Claude 작성)</em></p>

  <details open style="margin-top:16px;">
    <summary style="font-weight:600;color:#3B82F6;">📝 학생 일지 발췌 ${data.notes_count}건 (긴 발췌 순)</summary>
${top10.map((n) => `
    <blockquote>
      <cite>${escape(n.student)}, ${escape(n.batch)}·${escape(n.date || '')}</cite>
${(n.excerpts || []).slice(0, 2).map((e) => `      <p>${escape(e.slice(0, 250))}</p>`).join('\n')}
    </blockquote>`).join('')}
${data.notes.length > 10 ? `<p style="color:#9CA3AF;font-size:13px;">외 ${data.notes.length - 10}건은 all-data.json 참고</p>` : ''}
  </details>
</section>`;
}

// ═══ 섹션 4: 🎓 학생 깨달음 사례 ═══
function section4() {
  return `
<section class="student-insights">
  <h2>🎓 학생 깨달음 사례</h2>
  <blockquote><p>${EMPTY}</p><cite>${EMPTY}</cite></blockquote>
</section>`;
}

function divider() {
  return `\n<div class="section-divider">─── 사양 정보 (Reference) ───</div>\n`;
}

// ═══ 섹션 5: 🪑 운영 라인업 (자동 — 세트마스터) ═══
function section5() {
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
      <thead><tr><th>세트코드</th><th>색상</th><th>명칭</th><th>규격</th><th>채널</th></tr></thead>
      <tbody>
${sets.slice(0, 60).map((s) => `        <tr><td><code>${escape(s.set_code)}</code></td><td>${escape(s.set_color)}</td><td>${escape(s.set_name)}</td><td>${escape(s.size_detail || '-')}</td><td>${escape(s.channel_name || '-')}</td></tr>`).join('\n')}
${sets.length > 60 ? `        <tr><td colspan="5"><em>... 외 ${sets.length - 60}개</em></td></tr>` : ''}
      </tbody>
    </table>
  </details>`;
  }
  return html + '\n</section>';
}

// ═══ 섹션 6: 🎨 색상 옵션 (자동 — 코드 + 가이드 매칭) ═══
function section6() {
  const colors = [...new Set(data.set_master.map((s) => s.set_color).filter(Boolean))];
  if (colors.length === 0) return '';
  const colorMap = extractColorMap();
  return `
<section class="colors">
  <h2>🎨 마감재 / 색상 옵션</h2>
  <table>
    <thead><tr><th style="width:120px;">코드</th><th>색상명 (가이드 자동 매칭)</th><th>색상 칩 (이미지)</th></tr></thead>
    <tbody>
${colors.map((c) => `      <tr><td><code>${escape(c)}</code></td><td>${(colorMap[c] || []).map(escape).join(' / ') || EMPTY}</td><td>${EMPTY}</td></tr>`).join('\n')}
    </tbody>
  </table>
</section>`;
}

// ═══ 섹션 7: 🔧 소재 / 내장재 ═══
function section7() {
  const slides = data.pptx_slides || [];
  return `
<section class="materials">
  <h2>🔧 소재 / 내장재</h2>
  <p>${EMPTY}</p>
  ${slides.length > 0 ? `
  <details style="margin-top:12px;">
    <summary style="color:#3B82F6;font-weight:600;">📚 일룸 PPTX 자료 ${slides.length}장 매칭됨</summary>
${slides.slice(0, 8).map((s) => `
    <div style="background:#FAFBFC;border:1px solid #E5E7EB;padding:10px 14px;border-radius:6px;margin:8px 0;">
      <p style="font-size:12px;color:#6B7280;margin:0 0 6px;"><strong>슬라이드 ${s.slide_no}</strong>: ${escape(s.title)}</p>
      <pre style="white-space:pre-wrap;font-size:13px;margin:0;">${escape(s.text.slice(0, 600))}</pre>
    </div>`).join('')}
${slides.length > 8 ? `<p style="color:#9CA3AF;font-size:13px;">외 ${slides.length - 8}장은 all-data.json 참고</p>` : ''}
  </details>` : ''}
</section>`;
}

// ═══ 섹션 8: 📐 사이즈 도면 ═══
function section8() {
  return `
<section class="dimensions">
  <h2>📐 사이즈 도면</h2>
  <p>${EMPTY} <em style="color:#9CA3AF;font-size:13px;">(가이드 도면 이미지 — download-images.mjs 실행 후 추가)</em></p>
</section>`;
}

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
.tb-chapter summary { cursor: pointer; padding: 6px 0; }
.tb-chapter code { background: #F3F4F6; padding: 1px 4px; border-radius: 3px; font-family: 'D2Coding', monospace; font-size: 12px; }
.tb-chapter .section-divider { margin: 48px 0 24px; padding: 12px 16px; background: #F3F4F6; border-radius: 6px; text-align: center; font-size: 13px; font-weight: 700; color: #6B7280; letter-spacing: 0.08em; }
</style>`;

const html = `${styles}
<div class="tb-chapter">
${section1()}
${section2()}
${section3()}
${section4()}
${divider()}
${section5()}
${section6()}
${section7()}
${section8()}
</div>`;

const htmlFile = path.join(OUT_DIR, 'chapter-auto.html');
await fs.writeFile(htmlFile, html, 'utf-8');
const sizeKB = (Buffer.byteLength(html) / 1024).toFixed(1);

const category = data.catalog_cards[0]?.category || null;

if (DRY) {
  console.log(`[DRY-RUN] ${seriesName}: ${sizeKB}KB`);
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
  console.log(`✅ ${seriesName} ${sizeKB}KB`);
}
