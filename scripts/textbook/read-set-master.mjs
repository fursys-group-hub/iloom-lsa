// 세트마스터 엑셀 파일 분석
// 사용법: node scripts/textbook/read-set-master.mjs

import XLSX from 'xlsx';
import path from 'path';

const FILE = path.resolve('기존자료', '일룸 세트마스터목록 수파베이스 업로드.xlsx');

const workbook = XLSX.readFile(FILE);

console.log('=== 시트 목록 ===');
console.log(workbook.SheetNames);

for (const sheetName of workbook.SheetNames) {
  console.log(`\n========== 시트: ${sheetName} ==========`);
  const sheet = workbook.Sheets[sheetName];
  const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1');
  console.log(`범위: ${sheet['!ref']} (${range.e.r + 1}행 × ${range.e.c + 1}열)`);

  const json = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

  // 헤더 (첫 5행)
  console.log('\n--- 첫 5행 ---');
  for (let i = 0; i < Math.min(5, json.length); i++) {
    const row = json[i];
    console.log(`  [${i}]`, row.slice(0, 15).map(v => String(v).slice(0, 25)));
  }

  // 데이터 통계
  console.log(`\n총 ${json.length}행`);

  // 헤더가 있다면 column명
  if (json.length > 0) {
    const headers = json[0];
    console.log(`\n--- 컬럼 (${headers.length}개) ---`);
    headers.forEach((h, i) => {
      if (h) console.log(`  ${String.fromCharCode(65 + i)}. ${h}`);
    });
  }

  // 시리즈 컬럼이 있으면 unique 시리즈 출력
  if (json.length > 1) {
    const headers = json[0];
    const seriesIdx = headers.findIndex(h => /시리즈|series/i.test(String(h)));
    if (seriesIdx >= 0) {
      const series = new Set();
      for (let i = 1; i < json.length; i++) {
        const v = json[i][seriesIdx];
        if (v) series.add(String(v));
      }
      console.log(`\n--- 시리즈 종류 (${series.size}개) ---`);
      console.log(Array.from(series).sort().join(', '));
    }
  }
}
