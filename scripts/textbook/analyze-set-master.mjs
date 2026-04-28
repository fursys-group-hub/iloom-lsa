// 세트마스터 엑셀 추가 분석 — 중복/시리즈/품목군 통계
import XLSX from 'xlsx';
import path from 'path';

const FILE = path.resolve('기존자료', '일룸 세트마스터목록 수파베이스 업로드.xlsx');
const workbook = XLSX.readFile(FILE);
const sheet = workbook.Sheets['Sheet1'];
const json = XLSX.utils.sheet_to_json(sheet, { defval: '' });

console.log('총 행:', json.length);

// 세트코드 unique 검증
const codeSet = new Set();
const codeDupes = new Set();
const codeColorSet = new Set();
let codeColorDupes = 0;
for (const row of json) {
  const code = row['세트코드'];
  const color = row['세트색상'];
  if (codeSet.has(code)) codeDupes.add(code);
  codeSet.add(code);
  const key = `${code}_${color}`;
  if (codeColorSet.has(key)) codeColorDupes++;
  codeColorSet.add(key);
}
console.log(`세트코드 unique: ${codeSet.size}개 / 중복 코드: ${codeDupes.size}개 (예: ${[...codeDupes].slice(0,3).join(', ')})`);
console.log(`(코드+색상) unique: ${codeColorSet.size}개 / 중복: ${codeColorDupes}건`);

// 품목군 분포
const pumok = {};
const channel = {};
for (const row of json) {
  const p = row['품목군(명)'];
  const c = row['판매채널(명)'];
  pumok[p] = (pumok[p]||0)+1;
  channel[c] = (channel[c]||0)+1;
}
console.log('\n품목군:');
Object.entries(pumok).sort((a,b)=>b[1]-a[1]).forEach(([k,v])=>console.log(`  ${k}: ${v}`));
console.log('\n판매채널:');
Object.entries(channel).sort((a,b)=>b[1]-a[1]).forEach(([k,v])=>console.log(`  ${k}: ${v}`));

// 시리즈명 통계
const series = {};
for (const row of json) {
  const s = row['시리즈(명)'];
  series[s] = (series[s]||0)+1;
}
const seriesEntries = Object.entries(series).sort((a,b)=>b[1]-a[1]);
console.log(`\n시리즈 종류: ${seriesEntries.length}개 / Top 10:`);
seriesEntries.slice(0,10).forEach(([k,v])=>console.log(`  ${k}: ${v}`));
