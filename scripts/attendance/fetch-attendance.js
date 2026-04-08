#!/usr/bin/env node
/**
 * 출결 자동화 스크립트
 * 타임인아웃(timeinout.kr) → Excel 다운로드 → 파싱 → 앱 API 전송
 *
 * 사용법:
 *   npm run attendance              # 헤드리스 모드
 *   npm run attendance:headed       # 브라우저 보이는 모드 (디버깅)
 *   npm run attendance -- --date 2026-04-07   # 특정 날짜
 */

const { chromium } = require('playwright');
const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

const { login } = require('./timeinout-auth');
const { downloadAttendanceExcel } = require('./timeinout-scraper');

// .env.local 로드
dotenv.config({ path: path.join(__dirname, '../../.env.local') });

// ── 파싱 함수 (lib/attendance-parser.ts와 동일) ──

function excelSerialToDate(serial) {
  const epoch = new Date(1899, 11, 30);
  const d = new Date(epoch.getTime() + serial * 86400000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function excelSerialToTime(serial) {
  if (!serial || serial === '-' || serial === '미출근' || serial === '') return '-';
  const num = Number(serial);
  if (isNaN(num)) return String(serial);
  const fraction = num - Math.floor(num);
  const totalMinutes = Math.round(fraction * 24 * 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function parseStatus(checkIn, raw) {
  if (raw === '미출근' || raw === '-' || !raw) {
    if (!checkIn || checkIn === '-') return { status: 'absent', label: '미출근' };
  }
  if (raw && raw.includes('지각')) return { status: 'late', label: '지각' };
  if (raw && raw.includes('조퇴')) return { status: 'early_leave', label: '조퇴' };
  return { status: 'present', label: '출근' };
}

function parseExcelToRecords(filePath) {
  const wb = XLSX.readFile(filePath);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const json = XLSX.utils.sheet_to_json(ws, { defval: '' });

  return json
    .filter((r) => r['이름'] && r['날짜'])
    .map((r) => {
      const dateRaw = r['날짜'];
      const date = typeof dateRaw === 'number'
        ? excelSerialToDate(dateRaw)
        : String(dateRaw).match(/(\d{4}-\d{2}-\d{2})/)?.[1] || String(dateRaw);
      const checkIn = excelSerialToTime(r['출퇴근시간']);
      const checkOut = excelSerialToTime(r['출퇴근시간_1']);
      const statusRaw = String(r['출근'] || '');
      const { status } = parseStatus(checkIn, statusRaw);
      return {
        name: String(r['이름'] || ''),
        date,
        status,
        note: `출근 ${checkIn} / 퇴근 ${checkOut}`,
      };
    });
}

// ── 메인 실행 ──

async function main() {
  const args = process.argv.slice(2);
  const headed = args.includes('--headed');

  const email = process.env.TIMEINOUT_EMAIL;
  const password = process.env.TIMEINOUT_PW;
  const appUrl = process.env.APP_BASE_URL || 'http://localhost:3000';
  const workplace = process.env.TIMEINOUT_WORKPLACE || '입문교육';

  if (!email || !password) {
    console.error('오류: .env.local에 TIMEINOUT_EMAIL, TIMEINOUT_PW를 설정하세요.');
    process.exit(1);
  }

  const downloadDir = path.join(__dirname, 'downloads');
  if (!fs.existsSync(downloadDir)) fs.mkdirSync(downloadDir, { recursive: true });

  let browser;
  try {
    console.log('=== 출결 자동화 시작 ===');
    console.log(`모드: ${headed ? '브라우저 표시' : '헤드리스'}`);
    console.log(`근무지: ${workplace}`);
    console.log(`앱 URL: ${appUrl}`);
    console.log('');

    // 1. 브라우저 실행 + 로그인
    browser = await chromium.launch({ headless: !headed });
    const context = await browser.newContext({ acceptDownloads: true });
    const page = await context.newPage();

    await login(page, { email, password });

    // 2. 출퇴근현황 → Excel 다운로드
    const excelPath = await downloadAttendanceExcel(page, { workplace, downloadDir });

    // 3. Excel 파싱
    console.log('\n[파싱] Excel 데이터 변환 중...');
    const records = parseExcelToRecords(excelPath);
    console.log(`[파싱] ${records.length}명 출결 데이터 파싱 완료`);

    // 요약 출력
    const summary = {
      출근: records.filter(r => r.status === 'present').length,
      지각: records.filter(r => r.status === 'late').length,
      조퇴: records.filter(r => r.status === 'early_leave').length,
      미출근: records.filter(r => r.status === 'absent').length,
    };
    console.log(`[파싱] 출근: ${summary['출근']}명 | 지각: ${summary['지각']}명 | 조퇴: ${summary['조퇴']}명 | 미출근: ${summary['미출근']}명`);

    // 4. API 전송
    console.log(`\n[전송] ${appUrl}/api/attendance 로 전송 중...`);
    const res = await fetch(`${appUrl}/api/attendance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ records }),
    });

    const result = await res.json();
    console.log(`[전송] 완료! 저장: ${result.inserted}건, 스킵: ${result.skipped}건`);
    if (result.errors?.length > 0) {
      console.log('[전송] 오류:');
      result.errors.forEach(e => console.log(`  - ${e}`));
    }

    // 다운로드 파일 정리
    fs.unlinkSync(excelPath);

    console.log('\n=== 출결 자동화 완료 ===');
  } catch (err) {
    console.error('\n오류 발생:', err.message);
    process.exit(1);
  } finally {
    if (browser) await browser.close();
  }
}

main();
