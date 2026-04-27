// 일지에서 시리즈 키워드 주변만 추출 → 작은 텍스트 파일로 저장
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const seriesName = process.argv[2] || '코펜하겐';
const keywordsArg = process.argv[3] || `${seriesName},카우지,HCS714,HCC713,HCS710`;
const keywords = keywordsArg.split(',');

const baseDir = path.resolve(__dirname, 'output', `series-${seriesName}`);
const notesPath = path.join(baseDir, 'notes.json');
const notes = JSON.parse(await fs.readFile(notesPath, 'utf-8'));

const lines = [];
for (const n of notes) {
  const fullText = `${n.step1}\n${n.step2}\n${n.step3}`;
  const snippets = [];
  for (const kw of keywords) {
    let idx = fullText.indexOf(kw);
    while (idx >= 0) {
      const start = Math.max(0, idx - 150);
      const end = Math.min(fullText.length, idx + 400);
      snippets.push(`[${kw}] ${fullText.slice(start, end).replace(/\n/g, ' ')}`);
      idx = fullText.indexOf(kw, idx + kw.length);
    }
  }
  if (snippets.length === 0) continue;

  lines.push(`\n=== ${n.student_name} (${n.batch_label} ${n.date}) ${n.is_self_study ? '자율학습' : '교육일지'} ===`);
  // 중복 제거 (같은 키워드 인접 등장 시)
  const seen = new Set();
  for (const s of snippets) {
    const k = s.slice(0, 100);
    if (seen.has(k)) continue;
    seen.add(k);
    lines.push(s);
  }
}

const out = path.join(baseDir, 'notes-relevant.txt');
await fs.writeFile(out, lines.join('\n'), 'utf-8');
console.log(`✅ ${out} (${lines.length}줄, ${(await fs.stat(out)).size}바이트)`);
