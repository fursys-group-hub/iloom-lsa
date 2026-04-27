// PPT 파서 검증용 임시 스크립트
// 실행: node scripts/textbook/test-parse.mjs

import AdmZip from 'adm-zip';
import { parseStringPromise } from 'xml2js';
import fs from 'fs/promises';
import path from 'path';

const SOURCE_DIR = path.resolve('기존자료');

function collectTexts(node, out) {
  if (!node) return;
  if (Array.isArray(node)) { for (const x of node) collectTexts(x, out); return; }
  if (typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) {
      if (k === 'a:t') {
        if (typeof v === 'string') out.push(v);
        else if (Array.isArray(v)) for (const x of v) {
          if (typeof x === 'string') out.push(x);
          else if (x && typeof x === 'object' && '_' in x) out.push(String(x._));
        }
      } else collectTexts(v, out);
    }
  }
}

async function extract(filePath) {
  console.log(`\n=== ${path.basename(filePath)} ===`);
  const stat = await fs.stat(filePath);
  console.log(`파일 크기: ${(stat.size / 1024 / 1024).toFixed(1)} MB`);

  const t0 = Date.now();
  const buf = await fs.readFile(filePath);
  console.log(`읽기 ${Date.now() - t0}ms`);

  const t1 = Date.now();
  const zip = new AdmZip(buf);
  const entries = zip.getEntries().filter(e => /^ppt\/slides\/slide\d+\.xml$/.test(e.entryName));
  console.log(`zip 풀기 ${Date.now() - t1}ms, 슬라이드 ${entries.length}장`);

  entries.sort((a, b) => parseInt(a.entryName.match(/(\d+)\.xml$/)[1]) - parseInt(b.entryName.match(/(\d+)\.xml$/)[1]));

  const t2 = Date.now();
  const slides = [];
  for (const e of entries) {
    const no = parseInt(e.entryName.match(/(\d+)\.xml$/)[1]);
    const xml = e.getData().toString('utf-8');
    const out = [];
    try {
      const parsed = await parseStringPromise(xml, { explicitArray: true });
      collectTexts(parsed, out);
    } catch {
      out.push(...Array.from(xml.matchAll(/<a:t[^>]*>([^<]*)<\/a:t>/g)).map(m => m[1] || ''));
    }
    const cleaned = out.map(t => t.trim()).filter(Boolean);
    slides.push({ slide_no: no, title: cleaned[0], text: cleaned.join('\n') });
  }
  console.log(`텍스트 추출 ${Date.now() - t2}ms`);

  const totalChars = slides.reduce((s, x) => s + x.text.length, 0);
  console.log(`총 텍스트 ${totalChars.toLocaleString()}자`);

  // 첫 5장 미리보기
  console.log('\n--- 첫 5장 ---');
  for (const s of slides.slice(0, 5)) {
    console.log(`\n[Slide ${s.slide_no}] ${s.title || '(제목 없음)'}`);
    console.log(s.text.slice(0, 200) + (s.text.length > 200 ? '...' : ''));
  }
  return slides;
}

const files = await fs.readdir(SOURCE_DIR);
const pptxFiles = files.filter(f => f.toLowerCase().endsWith('.pptx')).map(f => path.join(SOURCE_DIR, f));

// 작은 파일부터 처리
const sorted = [];
for (const f of pptxFiles) {
  const stat = await fs.stat(f);
  sorted.push({ path: f, size: stat.size });
}
sorted.sort((a, b) => a.size - b.size);

for (const { path: p } of sorted) {
  await extract(p);
}
