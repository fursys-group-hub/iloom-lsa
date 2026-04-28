// chapter-claude.html (사람 작성 영업 노하우) + 자동 사양 섹션 합쳐서 DB upsert
// 사용법: node scripts/textbook/merge-chapter-with-spec.mjs <시리즈명>

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import fs from 'fs/promises';
import path from 'path';

config({ path: '.env.local' });

const seriesName = process.argv[2];
if (!seriesName) {
  console.error('사용법: node scripts/textbook/merge-chapter-with-spec.mjs <시리즈명>');
  process.exit(1);
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const OUT_DIR = path.resolve('scripts/textbook/output', `series-${seriesName}`);
const data = JSON.parse(await fs.readFile(path.join(OUT_DIR, 'all-data.json'), 'utf-8'));
const claudeHtml = await fs.readFile(path.join(OUT_DIR, 'chapter-claude.html'), 'utf-8');

function escape(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// 단품 표 (운영 라인업)
function specLineup() {
  if (data.set_master.length === 0) return '';
  const byPumok = {};
  for (const s of data.set_master) {
    const p = s.pumok_name || '(미분류)';
    if (!byPumok[p]) byPumok[p] = [];
    byPumok[p].push(s);
  }
  // 같은 set_name 그룹화 (색상 다른 단품 합치기)
  let html = `\n<div class="section-divider">─── 사양 정보 (Reference) ───</div>\n
<section class="lineup">
  <h2>🪑 운영 라인업 (단품 코드 + 사이즈)</h2>`;
  for (const pumok of Object.keys(byPumok)) {
    const sets = byPumok[pumok];
    // 명칭별 그룹 (색상은 합쳐서)
    const byName = {};
    for (const s of sets) {
      const n = s.set_name || '(이름 없음)';
      if (!byName[n]) byName[n] = { sample: s, colors: new Set(), codes: new Set() };
      byName[n].colors.add(s.set_color);
      byName[n].codes.add(s.set_code);
    }
    const groupCount = Object.keys(byName).length;
    html += `
  <h3>${escape(pumok)} <small style="color:#6B7280;font-weight:400;">(${groupCount}개 모델 / ${sets.length}개 단품)</small></h3>
  <details ${groupCount <= 8 ? 'open' : ''}>
    <summary>단품 ${groupCount}개 모델 펼치기</summary>
    <table>
      <thead><tr><th style="width:50%;">모델명</th><th>색상</th><th>규격</th></tr></thead>
      <tbody>
${Object.entries(byName).slice(0, 30).map(([name, info]) => {
  const colors = [...info.colors].slice(0, 8).join(', ');
  return `        <tr><td>${escape(name)} <small style="color:#9CA3AF;">(${[...info.codes].slice(0, 3).join('/')}${info.codes.size > 3 ? '...' : ''})</small></td><td style="font-size:13px;">${escape(colors)}${info.colors.size > 8 ? ' 외' : ''}</td><td>${escape(info.sample.size_detail || '-')}</td></tr>`;
}).join('\n')}
${Object.keys(byName).length > 30 ? `        <tr><td colspan="3"><em>... 외 ${Object.keys(byName).length - 30}개 모델</em></td></tr>` : ''}
      </tbody>
    </table>
  </details>`;
  }
  return html + '\n</section>';
}

// 색상 표
function specColors() {
  const colors = [...new Set(data.set_master.map((s) => s.set_color).filter(Boolean))];
  if (colors.length === 0) return '';
  // 가이드에서 색상 매핑 추출
  const colorMap = {};
  const validCodes = new Set(colors);
  for (const g of data.product_guides) {
    for (const tabKey of ['tab1', 'tab2', 'tab3', 'tab4', 'tab5']) {
      const tab = g[tabKey];
      if (!tab?.text) continue;
      const lines = tab.text.split('\n').map((l) => l.trim()).filter(Boolean);
      for (let i = 0; i < lines.length; i++) {
        const code = lines[i].replace(/\s*신규$/, '').replace(/\s*단종$/, '');
        if (!validCodes.has(code)) continue;
        const next = lines[i + 1];
        if (next && next.length >= 2 && next.length <= 30 && !/^[A-Z0-9]{2,4}$/.test(next) && /[가-힣A-Za-z]/.test(next)) {
          if (!colorMap[code]) colorMap[code] = [];
          if (!colorMap[code].includes(next)) colorMap[code].push(next);
        }
      }
    }
  }
  return `
<section class="colors">
  <h2>🎨 색상 옵션 (전체)</h2>
  <table>
    <thead><tr><th style="width:120px;">코드</th><th>색상명 (가이드 자동 매칭)</th></tr></thead>
    <tbody>
${colors.map((c) => `      <tr><td><code>${escape(c)}</code></td><td>${(colorMap[c] || []).map(escape).join(' / ') || '<em style="color:#9CA3AF;">매칭 없음</em>'}</td></tr>`).join('\n')}
    </tbody>
  </table>
  <p style="font-size:13px;color:#6B7280;">* 색상 칩 이미지는 download-images.mjs로 별도 처리 예정</p>
</section>`;
}

// PPTX 발췌
function specPptx() {
  const slides = data.pptx_slides || [];
  if (slides.length === 0) return '';
  return `
<section class="materials">
  <h2>🔧 추가 자료 (PPTX 슬라이드 발췌)</h2>
  <details>
    <summary style="color:#3B82F6;font-weight:600;">📚 일룸 PPTX ${slides.length}장 매칭됨</summary>
${slides.slice(0, 6).map((s) => `
    <div style="background:#FAFBFC;border:1px solid #E5E7EB;padding:10px 14px;border-radius:6px;margin:8px 0;">
      <p style="font-size:12px;color:#6B7280;margin:0 0 6px;"><strong>슬라이드 ${s.slide_no}</strong>: ${escape(s.title)}</p>
      <pre style="white-space:pre-wrap;font-size:13px;margin:0;">${escape(s.text.slice(0, 500))}</pre>
    </div>`).join('')}
${slides.length > 6 ? `<p style="color:#9CA3AF;font-size:13px;">외 ${slides.length - 6}장은 all-data.json 참고</p>` : ''}
  </details>
</section>`;
}

// 사이즈 도면 placeholder
function specDimensions() {
  return `
<section class="dimensions">
  <h2>📐 사이즈 도면</h2>
  <p style="color:#9CA3AF;"><em>가이드 도면 이미지 — download-images.mjs 실행 후 추가</em></p>
</section>`;
}

// 합치기 — claude HTML의 </div> 직전에 사양 섹션 삽입
// 색상 옵션 섹션은 제거 — 기본 정보 표의 색상 (6종)으로 충분
// (SPGY/OSPW 같은 조합 코드는 단일 색상이 아니라 베이스+포인트 조합이라 별도 표시 무의미)
const specSection = `${specLineup()}${specPptx()}${specDimensions()}`;
const merged = claudeHtml.replace(/<\/div>\s*$/, `${specSection}\n</div>`);

const outFile = path.join(OUT_DIR, 'chapter-final.html');
await fs.writeFile(outFile, merged, 'utf-8');
const sizeKB = (Buffer.byteLength(merged) / 1024).toFixed(1);
console.log(`✅ 합친 HTML: ${outFile} (${sizeKB}KB)`);

// DB upsert
const category = data.catalog_cards[0]?.category || null;
const { error } = await supabase
  .from('textbook_chapters')
  .upsert(
    {
      series_name: seriesName,
      category,
      html_content: merged,
      status: 'reviewing',
      source_note_ids: data.notes.map((n) => n.id),
      generated_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'series_name' }
  );
if (error) {
  console.error('❌ DB:', error.message);
  process.exit(1);
}
console.log(`✅ DB 저장: ${seriesName} status=reviewing`);
