/**
 * timeinout.kr 로그인 모듈
 * Playwright로 타임인아웃 관리자 페이지에 로그인
 */

async function login(page, { email, password }) {
  console.log('[로그인] timeinout.kr 접속 중...');
  await page.goto('https://com.timeinout.kr', { waitUntil: 'domcontentloaded' });

  // 로그인 폼 대기 + 입력
  await page.waitForSelector('input[type="email"], input[name="email"], input[placeholder*="이메일"]', { timeout: 15000 });
  const emailInput = await page.$('input[type="email"]') || await page.$('input[name="email"]') || await page.$('input[placeholder*="이메일"]');
  if (!emailInput) throw new Error('이메일 입력 필드를 찾을 수 없습니다');

  await emailInput.fill(email);

  const pwInput = await page.$('input[type="password"]');
  if (!pwInput) throw new Error('비밀번호 입력 필드를 찾을 수 없습니다');
  await pwInput.fill(password);

  // 로그인 버튼 클릭
  const loginBtn = await page.$('button[type="submit"]') || await page.$('button:has-text("로그인")');
  if (loginBtn) {
    await loginBtn.click();
  } else {
    await pwInput.press('Enter');
  }

  // 로그인 완료 대기 (대시보드 또는 메뉴 표시될 때까지)
  await page.waitForURL(/.*timeinout.*/, { timeout: 15000 });
  // 근태 메뉴가 나타날 때까지 대기
  await page.waitForTimeout(2000);
  console.log('[로그인] 로그인 성공!');
}

module.exports = { login };
