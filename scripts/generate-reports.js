/**
 * 종합 분석 리포트 생성 스크립트
 *
 * 사용법:
 *   node scripts/generate-reports.js [batchId]
 *
 * batchId 미지정 시 첫 번째 기수 사용.
 * .env.local에서 NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 필요.
 *
 * 워크플로우:
 *   1. 리포트 페이지에서 "📋 프롬프트 복사" → Claude Code에 붙여넣기
 *   2. Claude Code가 이 스크립트 로직으로 DB 데이터 수집 → 분석 → 리포트 생성 → DB 저장
 *   3. 또는 직접 실행: node scripts/generate-reports.js
 */

const fs = require('fs');
const path = require('path');

// ── 환경변수 로드 ──
function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env.local');
  if (!fs.existsSync(envPath)) throw new Error('.env.local 파일이 없습니다');
  fs.readFileSync(envPath, 'utf-8').split('\n').forEach(line => {
    const [key, ...val] = line.split('=');
    if (key && !key.startsWith('#')) process.env[key.trim()] = val.join('=').trim();
  });
}

loadEnv();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// ── 전역 변수 (데이터 수집 후 설정) ──
let data = {};
let classAvgTotal = 0;
let classAvgBySession = {};

// ──────────────────────────────────────────────
// Step 1: DB 데이터 수집
// ──────────────────────────────────────────────

async function collectData(batchId) {
  // 기수 정보
  const { data: batch } = await supabase.from('batches').select('*').eq('id', batchId).single();
  if (!batch) throw new Error(`기수를 찾을 수 없습니다: ${batchId}`);

  // 교육생 목록 (퇴사자 제외)
  const { data: students } = await supabase
    .from('students').select('id, name, store_location')
    .eq('batch_id', batchId).eq('is_dropped', false);

  const studentIds = students.map(s => s.id);

  // 시험 점수 (전체 — 반 평균 계산용)
  const { data: scores } = await supabase.from('test_scores').select('*').limit(5000);

  // 시험 응답 (학생별 개별 수집 — Supabase 1000건 리밋 회피)
  const allResponses = [];
  for (const sid of studentIds) {
    const { data: r } = await supabase.from('test_responses').select('*').eq('student_id', sid).limit(2000);
    if (r) allResponses.push(...r);
  }

  // 문제은행
  const { data: questions } = await supabase.from('questions').select('*').limit(2000);

  // 교육일지 + 실습일지
  const { data: notes } = await supabase.from('student_notes').select('*').in('student_id', studentIds);

  // 교육자 메모
  const { data: memos } = await supabase.from('student_memos').select('*').in('student_id', studentIds);

  // 출결
  const { data: attendance } = await supabase.from('attendance').select('*').in('student_id', studentIds);

  // 학생 질문
  const { data: studentQuestions } = await supabase.from('student_questions').select('*').in('student_id', studentIds);

  data = {
    batch,
    students: students || [],
    scores: scores || [],
    responses: allResponses,
    questions: questions || [],
    notes: notes || [],
    memos: memos || [],
    attendance: attendance || [],
    studentQuestions: studentQuestions || [],
  };

  // 반 평균 계산
  classAvgTotal = Math.round(data.scores.reduce((a, b) => a + b.score, 0) / data.scores.length * 100) / 100;
  data.scores.forEach(s => {
    if (!classAvgBySession[s.subject]) classAvgBySession[s.subject] = [];
    classAvgBySession[s.subject].push(s.score);
  });
  for (const [subj, arr] of Object.entries(classAvgBySession)) {
    classAvgBySession[subj] = Math.round(arr.reduce((a, b) => a + b, 0) / arr.length * 100) / 100;
  }

  console.log(`📊 데이터 수집 완료 — ${students.length}명`);
  console.log(`   scores: ${scores.length} / responses: ${allResponses.length} / notes: ${(notes || []).length} / memos: ${(memos || []).length}`);
}

// ──────────────────────────────────────────────
// Step 2: 학생별 분석
// ──────────────────────────────────────────────

function analyze(student) {
  const sid = student.id;
  const scores = data.scores.filter(s => s.student_id === sid).sort((a, b) => parseInt(a.subject) - parseInt(b.subject));
  const responses = data.responses.filter(r => r.student_id === sid);
  const notes = data.notes.filter(n => n.student_id === sid);
  const memos = data.memos.filter(m => m.student_id === sid);
  const attend = data.attendance.filter(a => a.student_id === sid);
  const questions = data.studentQuestions.filter(q => q.student_id === sid);

  const avg = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b.score, 0) / scores.length * 100) / 100 : 0;
  const best = scores.length > 0 ? scores.reduce((a, b) => b.score > a.score ? b : a) : {};
  const worst = scores.length > 0 ? scores.reduce((a, b) => b.score < a.score ? b : a) : {};

  // 출결 집계
  const att = { present: 0, late: 0, absent: 0 };
  attend.forEach(a => { att[a.status] = (att[a.status] || 0) + 1; });

  // 카테고리별 정답률
  const catStats = {};
  responses.forEach(r => {
    const q = data.questions.find(qq => qq.session === r.session && qq.question_id === r.question_id);
    if (!q) return;
    const cat = q.category || q.series || '기타';
    if (!catStats[cat]) catStats[cat] = { correct: 0, total: 0 };
    catStats[cat].total++;
    if (r.is_correct) catStats[cat].correct++;
  });

  const checklist = Object.entries(catStats).map(([cat, v]) => {
    const rate = Math.round(v.correct / v.total * 100);
    let status, level;
    if (rate >= 80) { status = 'O'; level = '🟢 자립'; }
    else if (rate >= 50) { status = '△'; level = '🟡 감독'; }
    else { status = 'X'; level = '🔴 재교육'; }
    return { cat, rate, status, level, total: v.total };
  }).filter(c => c.total >= 2).sort((a, b) => a.rate - b.rate);

  // 반복 오답
  const wrongByText = {};
  responses.filter(r => !r.is_correct).forEach(r => {
    const q = data.questions.find(qq => qq.session === r.session && qq.question_id === r.question_id);
    if (!q) return;
    const text = q.question_text || 'unknown';
    if (!wrongByText[text]) wrongByText[text] = { sessions: [], answers: [], correct: q.correct_answer, cat: q.category || '', series: q.series || '', detail: q.detail || '', options: q.options || '', explanation: q.explanation || '' };
    wrongByText[text].sessions.push(r.session);
    wrongByText[text].answers.push(r.user_answer);
  });
  const repeated = Object.entries(wrongByText).filter(([, v]) => v.sessions.length >= 2).sort((a, b) => b[1].sessions.length - a[1].sessions.length);

  // 자신감 집계
  const confCount = { confident: 0, half: 0, low: 0 };
  notes.forEach(n => { try { const c = JSON.parse(n.content); if (c.meta?.confidence) confCount[c.meta.confidence]++; } catch {} });

  // 실습일지 추출
  const practiceData = notes.filter(n => {
    try { return JSON.parse(n.content).meta?.tags?.includes('실습일지'); } catch { return false; }
  }).map(n => {
    const p = JSON.parse(n.content);
    return {
      date: n.created_at?.split('T')[0],
      step1: p.steps?.step1 || '', step2: p.steps?.step2 || '',
      step3: p.steps?.step3 || '', step4: p.steps?.step4 || '',
      consult: p.steps?.stats_consult || 0, estimate: p.steps?.stats_estimate || 0,
      order: p.steps?.stats_order || 0, amount: p.steps?.stats_amount || 0,
      orderDetail: p.steps?.order_detail || ''
    };
  });

  // 극복/고질 태그
  const overcome = [], chronic = [];
  repeated.forEach(([text, v]) => {
    const tag = v.detail || v.series || v.cat;
    const maxWrong = Math.max(...v.sessions.map(s => parseInt(s)));
    const laterCorrect = responses.find(r => {
      const q = data.questions.find(qq => qq.session === r.session && qq.question_id === r.question_id);
      return q?.question_text === text && parseInt(r.session) > maxWrong && r.is_correct;
    });
    (laterCorrect ? overcome : chronic).push(tag);
  });

  return { student, scores, avg, best, worst, att, checklist, repeated, confCount, memos, noteCount: notes.length, questionCount: questions.length, overcome: [...new Set(overcome)], chronic: [...new Set(chronic)], practiceData };
}

// ──────────────────────────────────────────────
// Step 3: 텍스트 생성 헬퍼
// ──────────────────────────────────────────────

function describeScore(avg) {
  if (avg >= 85) return '교육 내용 전반에 대한 이해도가 높으며, 제품 지식을 빠르게 습득하는 우수한 학습 역량을 보임';
  if (avg >= 75) return '교육 내용을 안정적으로 이해하고 있으며, 일부 세부 영역에서의 보강을 통해 실무 역량 향상이 기대됨';
  if (avg >= 65) return '기본적인 제품 지식은 갖추고 있으나, 세부 스펙 및 옵션 영역에서 추가 학습이 필요한 상태임';
  if (avg >= 55) return '핵심 제품에 대한 기초 지식 습득 단계에 있으며, 반복 학습을 통한 지속적인 보강이 필요함';
  return '제품 교육 전반에 걸쳐 기초부터의 집중적인 보강이 필요한 상태로, 매장에서 단계별 교육 진행을 권장함';
}

function describeGrowth(scores) {
  const gaps = scores.map(s => ({ subject: s.subject, score: s.score, gap: Math.round((s.score - (classAvgBySession[s.subject] || classAvgTotal)) * 100) / 100 }));
  if (gaps.length < 2) return '';

  const firstHalf = gaps.slice(0, Math.ceil(gaps.length / 2));
  const secondHalf = gaps.slice(Math.ceil(gaps.length / 2));
  const avgGapFirst = Math.round(firstHalf.reduce((a, b) => a + b.gap, 0) / firstHalf.length * 10) / 10;
  const avgGapSecond = Math.round(secondHalf.reduce((a, b) => a + b.gap, 0) / secondHalf.length * 10) / 10;

  if (gaps.every(g => g.gap >= 0) && avgGapFirst > 10) return `전 차시에 걸쳐 **반 평균을 꾸준히 상회**(평균 +${Math.round((avgGapFirst + avgGapSecond) / 2)}점), ==안정적인 학습 역량==을 보임`;
  if (gaps.every(g => g.gap >= 0)) return '**모든 차시에서 반 평균 이상**의 성적을 유지하고 있음';
  if (gaps.every(g => g.gap < 0)) return '대부분의 차시에서 반 평균을 하회하고 있어 ==전반적인 보강이 필요==한 상태임';
  if (avgGapSecond > avgGapFirst + 5) return '후반부로 갈수록 반 평균 대비 격차가 넓어지며, **학습 적응이 잘 이루어지고 있음**';
  if (avgGapFirst > avgGapSecond + 5) return '==후반부 과목에서 상대적으로 어려움==을 보이고 있음. 해당 카테고리 위주의 보강이 필요함';
  return '전 차시에 걸쳐 반 평균과 비슷한 수준을 **안정적으로 유지**하고 있음';
}

function describeConfidence(confCount, noteCount, questionCount) {
  const total = confCount.confident + confCount.half + confCount.low;
  if (total === 0 && noteCount < 5) return '교육 기간 중 학습 기록 빈도가 낮아, 매장에서의 자기주도 학습 습관 형성에 대한 지원이 필요할 것으로 판단됨';
  if (confCount.confident > total * 0.6) return '학습에 대한 자신감이 높고 교육 참여에 적극적인 태도를 일관되게 보임';
  if (confCount.low > total * 0.4) return '새로운 내용에 대해 신중하게 접근하는 성향을 보이며, 충분한 연습 시간과 구체적인 피드백이 학습 효과를 높이는 데 효과적임';
  if (noteCount >= 10 && questionCount > 0) return '교육일지를 꾸준히 작성하고 질문에도 적극적으로 참여하는 등 성실하고 자기주도적인 학습 태도가 관찰됨';
  if (noteCount >= 10) return '교육일지를 성실하게 작성하며 학습 내용을 체계적으로 정리하는 습관이 형성되어 있음';
  return '자기 페이스를 유지하며 꾸준히 학습하는 스타일로, 1:1 피드백을 통한 맞춤형 지도가 효과적임';
}

function describeAttendance(att) {
  if (att.absent > 0) return `결석 ${att.absent}회가 있어 해당 차시의 교육 내용을 별도로 보충해주시기 바랍니다.`;
  if (att.late >= 3) return `지각이 ${att.late}회 있었습니다. 매장 출근 시간 관리에 대한 안내가 필요할 수 있습니다.`;
  if (att.late > 0) return `지각 ${att.late}회를 제외하면 전반적으로 출결이 양호합니다.`;
  return '교육 기간 동안 출결이 매우 양호했습니다.';
}

function describeChecklistNote(cat, rate, repeated) {
  const relatedWrong = repeated.filter(([, v]) => v.cat === cat);
  const wrongDetail = relatedWrong.length > 0 ? relatedWrong[0][1].detail || relatedWrong[0][1].series : '';
  if (rate >= 80) return '교육 내용을 잘 숙지하고 있습니다';
  if (rate >= 70) return wrongDetail ? `대체로 양호하나 ${wrongDetail} 부분에서 혼동이 있어 확인 학습이 필요합니다` : '기본 내용은 이해하고 있으나 세부 스펙에서 추가 확인이 필요합니다';
  if (rate >= 50) return wrongDetail ? `${wrongDetail} 등 세부 사항에서 반복적인 오답이 나타나고 있어, 선임의 지도 하에 실무 학습을 병행해주세요` : '핵심 개념은 이해하고 있으나, 실무 적용을 위해 선임과 함께 제품을 보며 학습이 필요합니다';
  return '해당 영역의 기초 지식이 부족한 상태입니다. 카탈로그와 실제 전시품을 활용한 단계별 교육을 권장합니다';
}

// ── 실습일지 → 관찰자 시점 전문적 요약 ──
function synthesizePractice(practiceData) {
  let result = '';
  const totalConsult = practiceData.reduce((a, p) => a + p.consult, 0);
  const totalEstimate = practiceData.reduce((a, p) => a + p.estimate, 0);
  const totalOrder = practiceData.reduce((a, p) => a + p.order, 0);
  const totalAmount = practiceData.reduce((a, p) => a + p.amount, 0);
  const days = practiceData.length;

  result += `실습 ${days}일간 상담 ${totalConsult}건, 견적 ${totalEstimate}건, 수주 ${totalOrder}건`;
  if (totalAmount > 0) result += `(${totalAmount.toLocaleString()}원)`;
  result += '을 기록함. ';

  if (totalOrder > 0) result += '실습 초기에 **수주 실적을 달성**한 점이 주목할 만하며, 이는 고객 응대에 대한 기본 역량이 갖춰져 있음을 보여줌. ';
  if (totalConsult > 0 && totalEstimate === 0) result += '상담은 진행하였으나 견적 전환으로 이어지지 못하고 있어, ==견적서 작성 및 제안 역량 보강==이 필요함. ';
  else if (totalEstimate > 0 && totalOrder === 0) result += '견적 단계까지 진행하는 역량은 있으나, 클로징(수주 전환)에 대한 실전 경험이 더 필요한 단계임. ';
  result += '\n';

  const allStep1 = practiceData.map(p => p.step1).join(' ');
  const allStep3 = practiceData.map(p => p.step3).join(' ');
  const allStep4 = practiceData.map(p => p.step4).join(' ');

  // 강점 관찰
  const strengths = [];
  if (allStep3.match(/자신감|자신 있|뿌듯|할 수 있/)) strengths.push('고객 응대 경험을 통해 **자기 효능감이 형성**되고 있으며, 성공 경험에서 긍정적 자기 인식을 보임');
  if (allStep3.match(/혼자|단독|스스로/)) strengths.push('**단독 응대 경험**을 쌓아가며 독립적 업무 수행 역량이 성장하고 있음');
  if (allStep3.match(/칭찬|센스|잘 했/)) strengths.push('선임으로부터 긍정적 피드백을 받으며 **업무 적응이 순조로운 편**임');
  if (allStep3.match(/시연|설명|안내/) && allStep3.match(/고객.*반응|끄덕|좋아/)) strengths.push('제품 시연 및 설명 시 고객 반응을 이끌어내는 **프레젠테이션 역량**이 관찰됨');
  if (allStep1.match(/견적|세트|조합/)) strengths.push('복수 제품 조합 제안 및 견적 작성에 대한 실무 경험을 쌓고 있음');
  if (strengths.length > 0) result += strengths.join('. ') + '.\n';

  // 보완 필요 영역
  const improvements = [];
  if (allStep4.match(/무섭|떨리|떨렸|불안|걱정|위축|창피|부끄/)) improvements.push('실무 초기의 **심리적 불안감**이 관찰되며, 선임 동행 상담을 통한 점진적 독립이 필요함');
  if (allStep4.match(/프로모션|할인|가격|협상/)) improvements.push('==프로모션 및 가격 안내 역량==이 부족하여 가격대별 추천 리스트 숙지가 필요함');
  if (allStep4.match(/소재|가죽|패브릭|원목|MDF/)) improvements.push('==소재별 특성 설명==에 어려움을 보이고 있어 비교표 기반 반복 학습을 권장함');
  if (allStep4.match(/실측|측정|옷장.*사이즈/)) improvements.push('시스템 옷장 ==실측 역량이 부족==한 상태로, 선임 동행 실측 경험이 시급함');
  if (allStep4.match(/재고|시스템|태블릿.*찾/)) improvements.push('사내 시스템(재고 조회 등) 활용 숙련도가 낮아 실무 연습이 필요함');
  if (allStep4.match(/어렵|모르겠|못 하|못하|못 해/)) improvements.push('본인의 역량 부족을 ==스스로 인식==하고 개선 의지를 보이고 있어, 구체적인 학습 목표 설정이 효과적임');
  if (allStep4.match(/인증|안전|기본적인 것/)) improvements.push('제품 인증/안전 기준 등 **기초 제품 지식**에 대한 추가 학습이 필요함');
  if (improvements.length > 0) result += improvements.join('. ') + '.';

  return result;
}

// ──────────────────────────────────────────────
// Step 4: 리포트 생성
// ──────────────────────────────────────────────

function generateReport(a) {
  const { student, scores, avg, best, worst, att, checklist, repeated, confCount, memos, noteCount, questionCount, practiceData } = a;
  const diff = Math.round((avg - classAvgTotal) * 100) / 100;
  const diffSign = diff >= 0 ? '+' : '';

  // ── 📋 전반적인 피드백 ──
  let fb = `${student.name}님은 ${describeScore(avg)}. `;
  fb += describeConfidence(confCount, noteCount, questionCount) + '. ';

  // 교육자 메모 리라이트 반영
  try {
    const rewrites = JSON.parse(fs.readFileSync(path.join(__dirname, 'memo-rewrites.json'), 'utf-8'));
    const studentRewrite = rewrites[student.name];
    if (studentRewrite) {
      for (const cat of ['praise', 'behavior', 'general', 'caution', 'counsel']) {
        if (studentRewrite[cat]) studentRewrite[cat].forEach(t => { fb += t + ' '; });
      }
    } else if (memos.length > 0) {
      memos.forEach(m => { fb += m.content + '. '; });
    }
  } catch {}

  // 성적 추이 + 출결
  const growth = describeGrowth(scores);
  if (growth) fb += growth + '. ';
  fb += describeAttendance(att);

  // 실습일지 반영 (관찰자 시점 전문적 요약)
  if (practiceData.length > 0) {
    fb += '\n\n**[매장 실습 관찰]**\n';
    fb += synthesizePractice(practiceData);
  }

  // ── 📊 교육 과정 체크리스트 ──
  const mainCats = ['학생방', '키즈', '침실', '서재', '리빙', '주방', '가구 소재/공법', '의자', '브랜드', '시공/설치'];
  let checkTable = '| 영역 | 상태 | 자립도 | 정답률 | 전달사항 |\n|------|------|--------|--------|---------|';
  for (const mc of mainCats) {
    const c = checklist.find(x => x.cat === mc);
    if (c) {
      const note = describeChecklistNote(mc, c.rate, repeated);
      checkTable += `\n| ${c.cat} | ${c.status} | ${c.level} | ${c.rate}% | ${note} |`;
    }
  }

  // ── 📈 시험 성적 요약 ──
  let scoreStr = `- 전체 평균: ${avg}점 (반 평균 대비 ${diffSign}${diff})\n`;
  if (best.subject) scoreStr += `- 최고: ${best.subject} (${Math.round(best.score)}점) / 최저: ${worst.subject} (${Math.round(worst.score)}점)\n`;
  const chartData = scores.map(s => {
    const ca = classAvgBySession[s.subject] || classAvgTotal;
    return `${s.subject}:${Math.round(s.score)}:${Math.round(ca)}:${Math.round(s.score - ca)}`;
  }).join('|');
  scoreStr += `CHART:${chartData}`;

  // ── 🚨 반복 오답 문항 ──
  let wrongStr = '';
  repeated.slice(0, 5).forEach(([text, v]) => {
    const shortText = text.length > 150 ? text.substring(0, 150) + '...' : text;
    wrongStr += `Q. ${shortText}\n`;
    if (v.options) {
      const opts = v.options.split('|').map((o, i) => `${i + 1}) ${o.trim()}`).join('  ');
      wrongStr += `   보기: ${opts}\n`;
    }
    const uniqueAnswers = [...new Set(v.answers.map(a => (a || '미입력').substring(0, 80)))];
    wrongStr += `   ❌ 학생 선택: ${uniqueAnswers.join(' / ')}\n`;
    wrongStr += `   ✅ 정답: ${v.correct}\n`;
    if (v.explanation) wrongStr += `   ▸ 해설: ${v.explanation.substring(0, 100)}\n`;
    wrongStr += `   📌 ${v.sessions.join(', ')}에서 반복 오답 | ${v.cat} > ${v.series}\n\n`;
  });
  if (!wrongStr) wrongStr = '교육 기간 중 동일 문항을 2회 이상 틀린 경우가 없습니다.\n';

  // ── 💡 추천 교육 스타일 ──
  let coachStyle = '';
  const scoreVariance = scores.length > 1 ? Math.sqrt(scores.reduce((sum, s) => sum + Math.pow(s.score - avg, 2), 0) / scores.length) : 0;

  if (confCount.low > (confCount.confident + confCount.half)) {
    coachStyle += '- **칭찬과 격려**가 핵심입니다. 작은 성공 경험을 자주 만들어주시고, ==구체적인 칭찬==을 아끼지 말아주세요.\n';
  } else if (confCount.confident > (confCount.half + confCount.low)) {
    coachStyle += '- **도전적인 목표 설정**이 동기부여가 됩니다. 다만 디테일을 놓칠 수 있으니 ==정확성 중심 피드백==이 필요합니다.\n';
  } else {
    coachStyle += '- **명확한 학습 목표**와 체계적인 피드백을 제공하면 안정적으로 성장할 수 있습니다.\n';
  }

  // 메모 기반
  const allMemoText = memos.map(m => m.content).join(' ');
  if (allMemoText.includes('컨디션') || allMemoText.includes('기복')) coachStyle += '- ==컨디션 관리==가 중요합니다. 컨디션이 좋을 때 핵심 학습을 배치해주세요.\n';
  if (allMemoText.includes('관심없') || allMemoText.includes('흥미')) coachStyle += '- 흥미가 낮은 영역은 **"왜 필요한지"를 먼저 설명**한 뒤 학습하면 효과적입니다.\n';

  // 실습일지 기반
  if (practiceData.length > 0) {
    const allStep4 = practiceData.map(p => p.step4).join(' ');
    const allStep3 = practiceData.map(p => p.step3).join(' ');
    if (allStep4.match(/무섭|떨|불안|걱정|위축/)) coachStyle += '- 실습일지에서 **불안감과 위축**이 관찰됩니다. 실무 초기에 선임 동행 상담을 충분히 진행하고, 성공 경험을 통해 자신감을 쌓아주세요.\n';
    if (allStep4.match(/어렵|모르겠|못/)) coachStyle += '- 특정 영역에서 **역량 부족을 스스로 인식**하고 있습니다. 해당 영역(소재 설명, 실측, 가격 안내 등)을 우선 보강해주세요.\n';
    if (practiceData.reduce((a, p) => a + p.order, 0) > 0) coachStyle += '- 실습 기간 중 **수주 경험**이 있습니다. 이 성공 경험을 적극 활용하여 자신감을 키워주세요.\n';
    if (allStep3.match(/자신|뿌듯|할 수 있/)) coachStyle += '- 성공 경험에서 **긍정적 자기 인식**을 보이는 유형입니다. 작은 성과도 구체적으로 인정해주면 성장 속도가 빨라집니다.\n';
  }

  if (scoreVariance > 15) coachStyle += '- 카테고리별 성적 편차가 큰 편입니다. **관심 있는 영역부터 자신감을 쌓은 뒤**, 약한 영역으로 확장하는 순차적 접근을 권장합니다.\n';
  if (avg < 60) coachStyle += '- 하루 1~2개 핵심 포인트를 반복 학습하는 "소량 다회" 방식이 효과적입니다. 전시품을 직접 만지며 설명하는 체험형 교육을 추천합니다.\n';
  if (noteCount >= 12) coachStyle += '- 기록하며 학습하는 스타일입니다. 학습 자료(비교표, 정리 노트)를 제공하면 빠르게 흡수합니다.\n';
  if (questionCount >= 3) coachStyle += '- 질문이 활발한 편입니다. 궁금한 점을 즉시 해소해줄 수 있는 환경이 학습 효율을 높입니다.\n';

  // ── 🎯 첫 주 우선 교육 추천 ──
  const weakCats = checklist.filter(c => c.status === 'X' || c.status === '△').slice(0, 4);
  let firstWeek = '| 순서 | 영역 | 교육 방법 |\n|------|------|----------|\n';
  let fwIdx = 1;
  weakCats.forEach(c => {
    const desc = c.rate < 50 ? '전시품 앞에서 카탈로그와 함께 기초 학습. 매일 10분 퀴즈' : '매장 전시품 기준으로 핵심 스펙 복습. 실제 견적 작성 연습 병행';
    firstWeek += `| ${fwIdx++} | ${c.cat} | ${desc} |\n`;
  });
  if (repeated.length > 0 && fwIdx <= 5) {
    firstWeek += `| ${fwIdx++} | 반복 오답(${repeated[0][1].series}) | 전시품 앞에서 정답/오답 비교하며 스펙 재확인 |\n`;
  }
  if (practiceData.length > 0) {
    const allStep4 = practiceData.map(p => p.step4).join(' ');
    if (allStep4.includes('소재') && fwIdx <= 5) firstWeek += `| ${fwIdx++} | 소재 설명 연습 | 가죽/패브릭/원목/MDF 비교표 제공 + 전시품 앞에서 고객 역할극 |\n`;
    if (allStep4.includes('실측') && fwIdx <= 5) firstWeek += `| ${fwIdx++} | 시스템 옷장 실측 | 선임 동행 실측 3회 이상 + 실측 체크리스트 활용 |\n`;
    if (allStep4.includes('프로모션') && fwIdx <= 5) firstWeek += `| ${fwIdx++} | 프로모션/가격 안내 | 가격대별 추천 리스트 작성 + 견적서 작성 연습 |\n`;
  }
  if (att.absent > 0 && fwIdx <= 5) firstWeek += `| ${fwIdx++} | 결석 차시 보충 | 해당 차시 교육 자료 제공 + 핵심 브리핑 |\n`;
  if (fwIdx === 1) firstWeek = '전체적으로 양호한 수준으로, 매장 실무에 바로 투입 가능합니다.\n';

  const report = [
    '📋 신입에 대한 전반적인 피드백\n', fb,
    '\n\n📊 교육 과정 체크리스트\n', checkTable,
    '\n\n📈 시험 성적 요약\n', scoreStr,
    '\n\n🚨 반복 오답 문항\n', wrongStr,
    '💡 추천 교육 스타일\n', coachStyle,
    '\n🎯 첫 주 우선 교육 추천\n', firstWeek
  ].join('\n');

  return report;
}

// ──────────────────────────────────────────────
// Step 5: 메인 실행
// ──────────────────────────────────────────────

async function main() {
  // batchId: 인자 또는 기본값
  let batchId = process.argv[2];
  if (!batchId) {
    const { data: batches } = await supabase.from('batches').select('id, name').order('start_date', { ascending: false }).limit(1);
    if (!batches?.length) throw new Error('기수가 없습니다');
    batchId = batches[0].id;
    console.log(`📌 기수 미지정 → ${batches[0].name} 사용`);
  }

  await collectData(batchId);

  const today = new Date().toISOString().split('T')[0];
  const groupId = `comp_${today}_${Date.now()}`;
  const reports = [];

  for (const student of data.students) {
    const a = analyze(student);
    const report = generateReport(a);
    reports.push({
      student_id: student.id,
      test_date: today,
      student_message: '',
      manager_report: report,
      tag_tracking: { overcome: a.overcome, newWeak: [], chronic: a.chronic },
      report_type: 'comprehensive',
      report_group_id: groupId,
      subject: null
    });
    console.log(`✅ ${student.name} — ${report.length}자 (오답 ${a.checklist.filter(c => c.status === 'X').length}영역, 실습일지 ${a.practiceData.length}건)`);
  }

  const { error } = await supabase.from('coaching_reports').insert(reports);
  if (error) { console.log('❌ DB 오류:', error.message); process.exit(1); }
  console.log(`\n🎉 ${reports.length}명 리포트 DB 저장 완료! (group: ${groupId})`);
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
