// 실습일지 예시 데이터 시드
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function main() {
  // .env.local 로드
  const fs = require('fs');
  const envFile = fs.readFileSync('.env.local', 'utf-8');
  const env = {};
  envFile.split('\n').forEach(line => {
    const [k, ...v] = line.split('=');
    if (k && v.length) env[k.trim()] = v.join('=').trim();
  });

  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;

  // 곽현서 학생 ID 조회
  const studentsRes = await fetch(`${url}/rest/v1/students?name=eq.곽현서&select=id,name`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  const students = await studentsRes.json();
  if (!students.length) { console.log('곽현서 학생을 찾을 수 없습니다'); return; }
  const studentId = students[0].id;
  console.log('학생:', students[0].name, studentId);

  const stepsData = {
    step1: '신혼 부부가 거실 가구 세트를 보러 오셨는데, 남편분은 모던한 스타일, 아내분은 내추럴한 원목 스타일을 원하셔서 취향이 많이 달랐습니다.\n\n두 분의 공통점을 찾아보니 "깔끔하고 정돈된 느낌"을 좋아하신다는 걸 알게 돼서, 로이 시리즈를 추천드렸어요. 원목 느낌이면서도 라인이 깔끔해서 두 분 다 만족하셨습니다!',
    step2: '선배님이 고객님이 "좀 비싸네요"라고 하셨을 때 바로 가격 얘기를 하지 않고, "이 소파는 10년 써도 쿠션이 안 꺼져요, 1년에 12만원이면 카페 라떼 한잔 값이에요"라고 일상 비용으로 환산해서 설명하시는 게 정말 인상 깊었어요.\n\n다음에 가격 저항이 있을 때 저도 연 단위로 나눠서 설명해보고 싶어요!',
    step3: '처음으로 혼자서 견적 프로그램을 돌려봤어요! 선배님 도움 없이 배송비까지 포함해서 정확하게 뽑았습니다.\n\n고객님께 먼저 다가가서 인사를 건넨 것도 칭찬!',
    step4: '원목 소재 종류(참나무, 고무나무, 자작나무)별 특징을 설명할 때 좀 헷갈렸어요.\n\n내일 출근 전에 소재별 특징 정리해서 가야겠습니다.',
    step1_completed: true, step2_completed: true, step3_completed: true, step4_completed: true,
    step1_images: [], step2_images: [], step3_images: [], step4_images: [],
    stats_consult: 5, stats_estimate: 2, stats_order: 1, stats_amount: 1890000,
    order_detail: '상담 — 로이 6인 식탁, 모션데스크 1200, 쿠시노 소파\n견적 — 로이 6인 식탁+벤치 세트, 링키 플러스 책상+책장\n수주 — 로이 6인 식탁+의자4+벤치 세트 (1,890,000원)',
  };

  const packed = JSON.stringify({
    steps: stepsData,
    meta: { tags: ['실습일지'], confidence: null },
  });

  const insertRes = await fetch(`${url}/rest/v1/student_notes`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify({
      student_id: studentId,
      title: '2026-04-02 곽현서 / 실습일지',
      content: packed,
    }),
  });

  const result = await insertRes.json();
  console.log('결과:', insertRes.status, result[0]?.id || result);
}

main().catch(console.error);
