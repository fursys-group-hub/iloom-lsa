/**
 * timeinout.kr 출퇴근현황 스크래퍼
 * 근무지 필터 → 검색 → Excel 다운로드
 */
const path = require('path');
const fs = require('fs');

async function downloadAttendanceExcel(page, { workplace = '입문교육', downloadDir }) {
  console.log('[스크래퍼] 출퇴근현황 페이지로 이동 중...');

  // 근태 > 출퇴근현황 메뉴 클릭
  // 근태 메뉴 펼치기
  const menuItems = await page.$$('text=근태');
  for (const item of menuItems) {
    const isVisible = await item.isVisible();
    if (isVisible) {
      await item.click();
      break;
    }
  }
  await page.waitForTimeout(1000);

  // 출퇴근 현황 클릭
  const subMenu = await page.$('text=출퇴근 현황');
  if (subMenu) {
    await subMenu.click();
  } else {
    // URL로 직접 이동
    await page.goto('https://com.timeinout.kr/#none', { waitUntil: 'domcontentloaded' });
  }
  await page.waitForTimeout(2000);

  // 출퇴근현황 페이지 로딩 대기
  await page.waitForSelector('text=출퇴근현황', { timeout: 10000 }).catch(() => {});

  // 근무지 드롭다운에서 "입문교육" 선택
  console.log(`[스크래퍼] 근무지를 "${workplace}"(으)로 설정 중...`);
  const selects = await page.$$('select');
  let workplaceSelect = null;

  for (const sel of selects) {
    const options = await sel.$$('option');
    for (const opt of options) {
      const text = await opt.textContent();
      if (text && text.includes(workplace)) {
        workplaceSelect = sel;
        break;
      }
    }
    if (workplaceSelect) break;
  }

  if (workplaceSelect) {
    await workplaceSelect.selectOption({ label: workplace });
    console.log(`[스크래퍼] 근무지 "${workplace}" 선택 완료`);
  } else {
    console.warn(`[스크래퍼] 근무지 "${workplace}" 옵션을 찾지 못했습니다. 기본값으로 진행합니다.`);
  }

  // 검색 버튼 클릭
  const searchBtn = await page.$('button:has-text("검색")') || await page.$('button.btn-primary:has-text("검색")');
  if (searchBtn) {
    await searchBtn.click();
    console.log('[스크래퍼] 검색 실행');
  }
  await page.waitForTimeout(3000);

  // Excel 다운로드
  console.log('[스크래퍼] Excel 다운로드 중...');
  const downloadPromise = page.waitForEvent('download', { timeout: 30000 });

  const excelBtn = await page.$('button:has-text("Excel 다운로드")') ||
                   await page.$('button:has-text("Excel")') ||
                   await page.$('button:has-text("엑셀")');

  if (!excelBtn) {
    throw new Error('Excel 다운로드 버튼을 찾을 수 없습니다');
  }
  await excelBtn.click();

  const download = await downloadPromise;
  const suggestedName = download.suggestedFilename();
  const downloadPath = path.join(downloadDir, suggestedName);

  // 기존 파일 있으면 삭제
  if (fs.existsSync(downloadPath)) {
    fs.unlinkSync(downloadPath);
  }

  await download.saveAs(downloadPath);
  console.log(`[스크래퍼] 다운로드 완료: ${suggestedName}`);

  return downloadPath;
}

module.exports = { downloadAttendanceExcel };
