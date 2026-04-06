const fs = require('fs');
const data = JSON.parse(fs.readFileSync('/tmp/report_data.json', 'utf-8'));

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://jwjjdrbfjsuuslfzlvnu.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp3ampkcmJmanN1dXNsZnpsdm51Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDUxOTc4NywiZXhwIjoyMDkwMDk1Nzg3fQ.zCTUe5fVRiagLeLdR8Gb7cYW1MwC2Kzj_DhlC5NU4Fw';
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const groupId = 'comp_2026-04-06_1775461205575';
const classAvgTotal = 68.18;

// 차시별 반 평균 계산
const classAvgBySession = {};
data.scores.forEach(s => {
  if (!classAvgBySession[s.subject]) classAvgBySession[s.subject] = [];
  classAvgBySession[s.subject].push(s.score);
});
for (const [subj, arr] of Object.entries(classAvgBySession)) {
  classAvgBySession[subj] = Math.round(arr.reduce((a, b) => a + b, 0) / arr.length * 100) / 100;
}
console.log('차시별 반 평균:', JSON.stringify(classAvgBySession));

function analyze(student) {
  const sid = student.id;
  const scores = data.scores.filter(s => s.student_id === sid).sort((a, b) => parseInt(a.subject) - parseInt(b.subject));
  const responses = data.responses.filter(r => r.student_id === sid);
  const notes = data.notes.filter(n => n.student_id === sid);
  const memos = data.memos.filter(m => m.student_id === sid);
  const attend = data.attendance.filter(a => a.student_id === sid);
  const questions = data.studentQuestions.filter(q => q.student_id === sid);

  const avg = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b.score, 0) / scores.length * 100) / 100 : 0;
  const first = scores[0]?.score || 0;
  const last = scores[scores.length - 1]?.score || 0;
  const best = scores.reduce((a, b) => b.score > a.score ? b : a, scores[0] || {});
  const worst = scores.reduce((a, b) => b.score < a.score ? b : a, scores[0] || {});

  const att = { present: 0, late: 0, absent: 0 };
  attend.forEach(a => { att[a.status] = (att[a.status] || 0) + 1; });

  const catStats = {};
  responses.forEach(r => {
    const q = data.questions.find(qq => qq.session === r.session && qq.question_id === r.question_id);
    if (!q) return;
    if (!catStats[q.category]) catStats[q.category] = { correct: 0, total: 0 };
    catStats[q.category].total++;
    if (r.is_correct) catStats[q.category].correct++;
  });

  const checklist = Object.entries(catStats).map(([cat, v]) => {
    const rate = Math.round(v.correct / v.total * 100);
    let status, level;
    if (rate >= 80) { status = 'O'; level = '🟢 자립'; }
    else if (rate >= 50) { status = '△'; level = '🟡 감독'; }
    else { status = 'X'; level = '🔴 재교육'; }
    return { cat, rate, status, level, total: v.total };
  }).filter(c => c.total >= 2).sort((a, b) => a.rate - b.rate);

  const wrongByText = {};
  responses.filter(r => !r.is_correct).forEach(r => {
    const q = data.questions.find(qq => qq.session === r.session && qq.question_id === r.question_id);
    if (!q) return;
    const text = q.question_text || 'unknown';
    if (!wrongByText[text]) wrongByText[text] = { sessions: [], answers: [], correct: q.correct_answer, cat: q.category, series: q.series, detail: q.detail, options: q.options || '', explanation: q.explanation || '' };
    wrongByText[text].sessions.push(r.session);
    wrongByText[text].answers.push(r.user_answer);
  });
  const repeated = Object.entries(wrongByText).filter(([, v]) => v.sessions.length >= 2).sort((a, b) => b[1].sessions.length - a[1].sessions.length);

  let confCount = { confident: 0, half: 0, low: 0 };
  notes.forEach(n => { try { const c = JSON.parse(n.content); if (c.meta?.confidence) confCount[c.meta.confidence]++; } catch {} });

  const memoTexts = memos.map(m => m.content);

  const overcome = [];
  const chronic = [];
  repeated.forEach(([text, v]) => {
    const tag = v.detail || v.series || v.cat;
    const sessNums = v.sessions.map(s => parseInt(s));
    const maxWrong = Math.max(...sessNums);
    const laterCorrect = responses.find(r => {
      const q = data.questions.find(qq => qq.session === r.session && qq.question_id === r.question_id);
      return q?.question_text === text && parseInt(r.session) > maxWrong && r.is_correct;
    });
    if (laterCorrect) overcome.push(tag);
    else chronic.push(tag);
  });

  return { student, scores, avg, first, last, best, worst, att, checklist, repeated, confCount, memoTexts, noteCount: notes.length, questionCount: questions.length, overcome: [...new Set(overcome)], chronic: [...new Set(chronic)] };
}

// ── 메모 원문 → 전문적 톤 리라이트 (범용) ──
function professionalRewrite(text, category) {
  let result = text.trim().replace(/\s+/g, ' ');

  if (category === 'praise') {
    // 칭찬: 이미 긍정적이므로 톤만 다듬기
    result = applyPraiseRewrites(result);
  } else if (category === 'caution' || category === 'behavior') {
    // 주의: 부정적 표현 → 건설적/전문적 표현
    result = applyCautionRewrites(result);
  }
  // counsel, general → 원문 유지하되 마침표 정리

  // 마침표 정리
  result = result.replace(/\.+/g, '.').replace(/\s+\./g, '.');
  if (!result.match(/[.다음함됨임]$/)) result += '.';

  return result;
}

function applyPraiseRewrites(text) {
  return text
    // 구어체 → 문어체
    .replace(/수업태도 좋음/g, '교육 시간 중 집중도 높은 학습 태도를 보임')
    .replace(/공부 열심히 함/g, '학습에 대한 높은 의지와 노력을 보임')
    .replace(/말 잘함/g, '**의사소통 능력이 우수**함')
    .replace(/동기들 잘 챙김/g, '동료 교육생에 대한 **배려심**이 돋보임')
    .replace(/밝은 태도/g, '밝고 긍정적인 태도')
    .replace(/성격 사글사글함/g, '**친화력이 좋아** 고객 라포 형성에 강점을 보일 것으로 예상됨')
    .replace(/성실하고 부지런/g, '**성실하고 부지런한 태도**를 보임')
    .replace(/집중도도? ?매우 좋음/g, '**수업 집중도가 매우 우수**함')
    .replace(/집중도도? ?좋음/g, '수업 집중도가 양호함');
}

function applyCautionRewrites(text) {
  let r = text;

  // ── 1단계: 구체적 패턴 매칭 (긴 패턴 먼저) ──
  r = r
    .replace(/컨디션이 좋을 때와 아닐 때가 매우 다름/g, '==컨디션에 따른 학습 집중도 편차==가 관찰됨')
    .replace(/좋지 못한 수업태도를 보임/g, '학습 집중도가 다소 저하되는 모습이 관찰됨')
    .replace(/좋지 못한 수업태도/g, '학습 집중도 관리가 필요함')
    .replace(/차이가 명확하게 느껴지는 편/g, '**흥미 영역과 비흥미 영역 간 몰입도 차이**가 뚜렷한 편')
    .replace(/단정치 못한 태도/g, '==근무 시 복장 및 자세 관리==에 대한 안내가 필요함')
    .replace(/담배\s?냄새/g, '==매장 근무 시 개인 위생 관리==에 대한 안내가 필요함');

  // ── 2단계: 부정적 표현 → 건설적 표현 (범용) ──
  r = r
    // 성적/능력
    .replace(/성적이 매우 낮음을 인지/g, '본인의 학습 현황을 인지하고 있으며 개선 의지를 보이고 있음')
    .replace(/성적이 (매우 )?낮/g, '현재 기초 역량 강화가 필요한 단계에 있')
    .replace(/잘 구분하지 못함/g, '==세부 차이점 구분에 어려움==을 보이고 있어 반복 학습과 비교 자료 제공이 도움이 될 것임')
    .replace(/잘 모르[고는]?/g, '해당 영역의 이해도를 높이기 위한 추가 학습이 필요하')
    .replace(/못함/g, '어려움을 보이고 있음')
    .replace(/못한/g, '어려움을 보이는')
    .replace(/못하/g, '어려움을 보이')

    // 태도
    .replace(/수동적인 태도/g, '**능동적 참여를 이끌어내기 위한 지원**이 필요함. 질문을 유도하고 발표 기회를 제공하면 효과적임')
    .replace(/질문이 없[고는]?/g, '자발적 질문 빈도가 낮은 편으로, ')
    .replace(/소극적/g, '적극성을 이끌어내기 위한 격려가 필요한')
    .replace(/소심함?/g, '**신중하고 조심스러운 성향**으로, 충분한 격려와 연습 기회가 효과적임')
    .replace(/말수가 적/g, '**차분하고 과묵한 성격**으로, 1:1 소통에서 더 편안하게 의견을 표현하는 편')
    .replace(/예민한?\s?편?/g, '**세심하고 감수성이 풍부한 성향**으로, 피드백 시 건설적인 표현이 효과적임')
    .replace(/관심없는 것/g, '비관심 영역')
    .replace(/관심이? ?없/g, '관심도가 낮')

    // 학습
    .replace(/열심히 하고 있으나/g, '**학습 의지는 높으나**')
    .replace(/열심히 하고자 하나/g, '**학습 의지는 높으나**')
    .replace(/느린?\s?편/g, '==다소 시간이 필요한 편==으로, 소량 반복 학습이 효과적임');

  return r;
}

// ── 전문적 톤으로 표현 변환 ──

function describeScore(avg) {
  if (avg >= 85) return '교육 내용 전반에 대한 이해도가 높으며, 제품 지식을 빠르게 습득하는 우수한 학습 역량을 보임';
  if (avg >= 75) return '교육 내용을 안정적으로 이해하고 있으며, 일부 세부 영역에서의 보강을 통해 실무 역량 향상이 기대됨';
  if (avg >= 65) return '기본적인 제품 지식은 갖추고 있으나, 세부 스펙 및 옵션 영역에서 추가 학습이 필요한 상태임';
  if (avg >= 55) return '핵심 제품에 대한 기초 지식 습득 단계에 있으며, 반복 학습을 통한 지속적인 보강이 필요함';
  return '제품 교육 전반에 걸쳐 기초부터의 집중적인 보강이 필요한 상태로, 매장에서 단계별 교육 진행을 권장함';
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

function describeGrowth(first, last, scores) {
  // 차시별로 다른 과목을 보므로, 단순 점수 비교는 무의미
  // → 반 평균 대비 상대 성적(gap)의 추이를 분석
  const gaps = scores.map(s => {
    const classAvg = classAvgBySession[s.subject] || classAvgTotal;
    return { subject: s.subject, score: s.score, gap: Math.round((s.score - classAvg) * 100) / 100 };
  });

  if (gaps.length < 2) return '데이터가 부족하여 추이 분석이 어렵습니다';

  const firstHalf = gaps.slice(0, Math.ceil(gaps.length / 2));
  const secondHalf = gaps.slice(Math.ceil(gaps.length / 2));
  const avgGapFirst = Math.round(firstHalf.reduce((a, b) => a + b.gap, 0) / firstHalf.length * 10) / 10;
  const avgGapSecond = Math.round(secondHalf.reduce((a, b) => a + b.gap, 0) / secondHalf.length * 10) / 10;

  // 반 평균 대비 일관된 우수/부진 여부
  const allAbove = gaps.every(g => g.gap >= 0);
  const allBelow = gaps.every(g => g.gap < 0);
  const gapVariance = Math.sqrt(gaps.reduce((s, g) => s + Math.pow(g.gap - (avgGapFirst + avgGapSecond) / 2, 2), 0) / gaps.length);

  // 가장 잘한/못한 차시
  const best = gaps.reduce((a, b) => b.gap > a.gap ? b : a);
  const worst = gaps.reduce((a, b) => b.gap < a.gap ? b : a);

  let desc = '';

  if (allAbove && avgGapFirst > 10) {
    desc = `전 차시에 걸쳐 **반 평균을 꾸준히 상회**(평균 +${Math.round((avgGapFirst + avgGapSecond) / 2)}점), ==안정적인 학습 역량==을 보임`;
  } else if (allAbove) {
    desc = `**모든 차시에서 반 평균 이상**의 성적을 유지하고 있음`;
  } else if (allBelow) {
    desc = `대부분의 차시에서 반 평균을 하회하고 있어 ==전반적인 보강이 필요==한 상태임`;
  } else if (avgGapSecond > avgGapFirst + 5) {
    desc = `후반부로 갈수록 반 평균 대비 격차가 넓어지며(전반 ${avgGapFirst > 0 ? '+' : ''}${avgGapFirst} → 후반 ${avgGapSecond > 0 ? '+' : ''}${avgGapSecond}), **학습 적응이 잘 이루어지고 있음**`;
  } else if (avgGapFirst > avgGapSecond + 5) {
    desc = `==후반부 과목(침실, 서재, 리빙 등)에서 상대적으로 어려움==을 보이고 있음. 해당 카테고리 위주의 보강이 필요함`;
  } else if (gapVariance > 15) {
    desc = `**카테고리별 강약이 뚜렷**함. ${best.subject}(반 평균 대비 +${Math.round(best.gap)}점)이 가장 강하고, ==${worst.subject}에서 가장 어려움==을 보임`;
  } else {
    desc = `전 차시에 걸쳐 반 평균과 비슷한 수준을 **안정적으로 유지**하고 있음`;
  }

  return desc;
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
  if (rate >= 70) {
    if (wrongDetail) return `대체로 양호하나 ${wrongDetail} 부분에서 혼동이 있어 확인 학습이 필요합니다`;
    return '기본 내용은 이해하고 있으나 세부 스펙에서 추가 확인이 필요합니다';
  }
  if (rate >= 50) {
    if (wrongDetail) return `${wrongDetail} 등 세부 사항에서 반복적인 오답이 나타나고 있어, 선임의 지도 하에 실무 학습을 병행해주세요`;
    return '핵심 개념은 이해하고 있으나, 실무 적용을 위해 선임과 함께 제품을 보며 학습이 필요합니다';
  }
  return '해당 영역의 기초 지식이 부족한 상태입니다. 카탈로그와 실제 전시품을 활용한 단계별 교육을 권장합니다';
}

function describeFirstWeekItem(cat, rate, repeated) {
  const relatedWrong = repeated.filter(([, v]) => v.cat === cat);
  const wrongSeries = relatedWrong.length > 0 ? relatedWrong[0][1].series : '';

  if (rate < 50) {
    if (wrongSeries) return `${cat}(${wrongSeries}) — 전시품 앞에서 제품 카탈로그와 함께 기본 스펙부터 학습. 매일 10분 퀴즈 권장`;
    return `${cat} — 카탈로그와 전시품을 활용한 기초 학습. 주 2회 이상 핵심 포인트 확인`;
  }
  if (wrongSeries) return `${cat}(${wrongSeries}) — 해당 시리즈 전시품 보며 색상/사이즈/옵션 재확인. 고객 상담 시 선임 동행`;
  return `${cat} — 매장 전시품 기준으로 핵심 스펙 복습. 실제 견적 작성 연습 병행`;
}

function generateReport(a) {
  const { student, scores, avg, first, last, best, worst, att, checklist, repeated, confCount, memoTexts, noteCount, questionCount, overcome, chronic } = a;
  const diff = Math.round((avg - classAvgTotal) * 100) / 100;
  const diffSign = diff >= 0 ? '+' : '';

  // ── 📋 전반적인 피드백 (전문적 톤) ──
  let fb = `${student.name}님은 ${describeScore(avg)}. `;
  fb += describeConfidence(confCount, noteCount, questionCount) + '. ';

  // 교육자 메모 → Claude가 직접 리라이트한 전문적 표현 사용
  const rewrites = require('./memo-rewrites.json');
  const studentRewrite = rewrites[student.name];

  if (studentRewrite) {
    // 리라이트된 메모가 있으면 사용
    const order = ['praise', 'behavior', 'general', 'caution', 'counsel'];
    for (const cat of order) {
      if (studentRewrite[cat]) {
        for (const text of studentRewrite[cat]) {
          fb += text + ' ';
        }
      }
    }
  } else if (memoTexts.length > 0) {
    // 리라이트가 없으면 범용 변환기 사용 (fallback)
    const allMemos = data.memos.filter(m => m.student_id === student.id);
    for (const memo of allMemos) {
      fb += professionalRewrite(memo.content, memo.category) + ' ';
    }
  } else {
    // 메모가 없을 때: 데이터 기반 성격/태도 추론
    const scoreVariance = scores.length > 1 ? Math.sqrt(scores.reduce((sum, s) => sum + Math.pow(s.score - avg, 2), 0) / scores.length) : 0;

    if (noteCount >= 12 && questionCount >= 3) {
      fb += '교육일지 작성과 질문 참여가 매우 활발하여, **자기주도적 학습 역량이 우수**한 것으로 판단됩니다. ';
    } else if (noteCount >= 10) {
      fb += '교육일지를 **성실하게 작성**하며 학습 내용을 꼼꼼하게 정리하는 모습을 보였습니다. ';
    } else if (noteCount < 7) {
      fb += '교육 기록이 다소 적은 편이므로, ==매장에서 일일 학습 기록을 권장==합니다. ';
    }

    if (scoreVariance > 15) {
      fb += '==관심 분야와 비관심 분야의 학습 차이가 뚜렷==하여, 취약 영역 우선 교육이 필요합니다. ';
    } else if (scoreVariance < 5 && avg >= 65) {
      fb += '전 영역에서 **고르게 학습하는 안정적인 스타일**을 보입니다. ';
    }
  }

  fb += describeGrowth(first, last, scores) + '. ';
  fb += describeAttendance(att);

  // 강점/약점 카테고리 → 체크리스트에서 이미 표시하므로 피드백에서 제거

  // ── 📊 체크리스트 ──
  const mainCats = ['학생방', '키즈', '침실', '서재', '리빙', '주방', '가구 소재/공법', '의자', '브랜드', '시공/설치'];
  let checkTable = '| 영역 | 상태 | 자립도 | 정답률 | 전달사항 |\n|------|------|--------|--------|---------|';
  for (const mc of mainCats) {
    const c = checklist.find(x => x.cat === mc);
    if (c) {
      const note = describeChecklistNote(mc, c.rate, repeated);
      checkTable += `\n| ${c.cat} | ${c.status} | ${c.level} | ${c.rate}% | ${note} |`;
    }
  }

  // ── 📈 성적 ──
  let scoreStr = `- 전체 평균: ${avg}점 (반 평균 대비 ${diffSign}${diff})\n`;
  if (best.subject) scoreStr += `- 최고: ${best.subject} (${Math.round(best.score)}점) / 최저: ${worst.subject} (${Math.round(worst.score)}점)\n`;
  // 차시별 데이터를 CHART: 마커로 전달 (렌더러가 바 차트로 변환)
  const chartData = scores.map(s => {
    const ca = classAvgBySession[s.subject] || classAvgTotal;
    const gap = Math.round(s.score - ca);
    return `${s.subject}:${Math.round(s.score)}:${Math.round(ca)}:${gap}`;
  }).join('|');
  scoreStr += `CHART:${chartData}`;

  // ── 🚨 반복 오답 ──
  let wrongStr = '';
  repeated.slice(0, 5).forEach(([text, v]) => {
    const shortText = text.length > 150 ? text.substring(0, 150) + '...' : text;
    wrongStr += `Q. ${shortText}\n`;
    if (v.options) {
      const opts = v.options.split('|').map((o, i) => `${i + 1}) ${o.trim()}`).join('  ');
      wrongStr += `   보기: ${opts}\n`;
    }
    // 학생이 각 차시에서 선택한 답
    const uniqueAnswers = [...new Set(v.answers.map(a => (a || '미입력').substring(0, 80)))];
    wrongStr += `   ❌ 학생 선택: ${uniqueAnswers.join(' / ')}\n`;
    wrongStr += `   ✅ 정답: ${v.correct}\n`;
    if (v.explanation) wrongStr += `   ▸ 해설: ${v.explanation.substring(0, 100)}\n`;
    wrongStr += `   📌 ${v.sessions.join(', ')}에서 반복 오답 | ${v.cat} > ${v.series}\n\n`;
  });
  if (!wrongStr) wrongStr = '교육 기간 중 동일 문항을 2회 이상 틀린 경우가 없습니다.\n';

  // 🏷️ 취약유형 → 체크리스트/오답에 통합, 별도 섹션 삭제

  // 📝 전달사항 → 체크리스트에 통합, 별도 섹션 삭제
  // 강점 요약은 피드백에 포함

  // ── 🎯 첫 주 (테이블 형식) ──
  const weakCats = checklist.filter(c => c.status === 'X' || c.status === '△').slice(0, 4);
  let firstWeek = '| 순서 | 영역 | 교육 방법 |\n|------|------|----------|\n';
  let fwIdx = 1;
  weakCats.forEach(c => {
    const desc = describeFirstWeekItem(c.cat, c.rate, repeated).replace(/^[^—]+—\s*/, '');
    firstWeek += `| ${fwIdx++} | ${c.cat} | ${desc} |\n`;
  });
  if (repeated.length > 0 && fwIdx <= 5) {
    firstWeek += `| ${fwIdx++} | 반복 오답(${repeated[0][1].series}) | 전시품 앞에서 정답/오답 비교하며 스펙 재확인 |\n`;
  }
  if (att.absent > 0 && fwIdx <= 5) {
    firstWeek += `| ${fwIdx++} | 결석 차시 보충 | 해당 차시 교육 자료 제공 + 핵심 브리핑 |\n`;
  }
  if (fwIdx === 1) {
    firstWeek = '전체적으로 양호한 수준으로, 매장 실무에 바로 투입 가능합니다.\n';
  }

  // ── 💡 추천 교육 스타일 ──
  let coachStyle = '';
  const scoreVariance = scores.length > 1 ? Math.sqrt(scores.reduce((sum, s) => sum + Math.pow(s.score - avg, 2), 0) / scores.length) : 0;

  // 자신감 기반
  if (confCount.low > (confCount.confident + confCount.half)) {
    coachStyle += '- **칭찬과 격려**가 핵심입니다. 작은 성공 경험을 자주 만들어주시고, ==구체적인 칭찬==을 아끼지 말아주세요. 실수 지적보다 개선 방향을 함께 찾아주는 접근이 효과적입니다.\n';
  } else if (confCount.confident > (confCount.half + confCount.low)) {
    coachStyle += '- **도전적인 목표 설정**이 동기부여가 됩니다. 다만 디테일을 놓칠 수 있으니 ==정확성 중심 피드백==이 필요합니다.\n';
  } else {
    coachStyle += '- **명확한 학습 목표**와 체계적인 피드백을 제공하면 안정적으로 성장할 수 있습니다.\n';
  }

  // 성적 패턴 기반
  // 메모 기반 교육 스타일 추가
  const allMemos = data.memos.filter(m => m.student_id === student.id);
  const allMemoText = allMemos.map(m => m.content).join(' ');
  if (allMemoText.includes('컨디션') || allMemoText.includes('기복')) {
    coachStyle += '- ==컨디션 관리==가 중요합니다. 컨디션이 좋을 때 핵심 학습을 배치하고, 컨디션이 낮을 때는 가벼운 복습이나 실물 체험 위주로 진행해주세요.\n';
  }
  if (allMemoText.includes('관심없') || allMemoText.includes('흥미')) {
    coachStyle += '- 흥미가 낮은 영역은 **"왜 필요한지"를 먼저 설명**한 뒤 학습하면 효과적입니다. 실제 고객 사례를 들어 필요성을 체감시켜주세요.\n';
  }
  if (scoreVariance > 15) {
    coachStyle += '- 카테고리별 성적 편차가 큰 편입니다. **관심 있는 영역부터 자신감을 쌓은 뒤**, 약한 영역으로 확장하는 순차적 접근을 권장합니다.\n';
  }
  if (avg < 60) {
    coachStyle += '- 한 번에 많은 내용을 전달하기보다, 하루 1~2개 핵심 포인트를 반복 학습하는 "소량 다회" 방식이 효과적입니다. 전시품을 직접 만지며 설명하는 체험형 교육을 추천합니다.\n';
  }
  if (noteCount >= 12) {
    coachStyle += '- 기록하며 학습하는 스타일입니다. 학습 자료(비교표, 정리 노트)를 제공하면 빠르게 흡수합니다.\n';
  }
  if (questionCount >= 3) {
    coachStyle += '- 질문이 활발한 편입니다. 궁금한 점을 즉시 해소해줄 수 있는 환경(선임 바로 옆 자리 배치 등)이 학습 효율을 높입니다.\n';
  }
  if (last > first + 15) {
    coachStyle += '- 시간이 지날수록 성장하는 유형입니다. 초반에 조급해하지 말고 꾸준히 기다려주시면 좋은 결과를 보여줄 것입니다.\n';
  }
  if (!coachStyle) coachStyle = '- 안정적인 학습 스타일을 보이므로, 체계적인 OJT 프로그램에 따라 교육하시면 됩니다.\n';

  const report = [
    '📋 신입에 대한 전반적인 피드백\n',
    fb,
    '\n\n📊 교육 과정 체크리스트\n',
    checkTable,
    '\n\n📈 시험 성적 요약\n',
    scoreStr,
    '\n\n🚨 반복 오답 문항\n',
    wrongStr,
    '💡 추천 교육 스타일\n',
    coachStyle,
    '\n🎯 첫 주 우선 교육 추천\n',
    firstWeek
  ].join('\n');

  return { report, overcome, chronic };
}

async function main() {
  const reports = [];
  for (const student of data.students) {
    const a = analyze(student);
    const { report, overcome, chronic } = generateReport(a);
    reports.push({
      student_id: student.id,
      test_date: '2026-04-06',
      student_message: '',
      manager_report: report,
      tag_tracking: { overcome, newWeak: [], chronic },
      report_type: 'comprehensive',
      report_group_id: groupId,
      subject: null
    });
    console.log('✅', student.name, '- 리포트 생성 (' + report.length + '자)');
  }

  const { error } = await supabase.from('coaching_reports').upsert(reports, { onConflict: 'student_id,test_date,report_type' });
  if (error) console.log('❌ DB 오류:', error.message);
  else console.log('\n🎉 전체', reports.length, '명 리포트 DB 저장 완료!');
}

main().catch(console.error);
