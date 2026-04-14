# 종합 UI/UX 감사 리포트 — 입문교육 관리 시스템

> 2026-04-12 작성. 20년차 UI/UX 디자이너 관점에서 "입문교육 운영 + 효과 측정" 목적 기준으로 분석.
> 수지님은 비개발자이며, 매일 아침 출결→테스트→교육일지→실습일지→질문관리 순으로 운영함.

---

## 완료된 항목 (2026-04-13)

- [x] **디자인 토큰 베스트프랙티스 적용** (globals.css)
  - `--radius-xs: 4px` 추가
  - 간격 토큰 8px 그리드 (`--space-1` ~ `--space-12`)
  - 컴포넌트 높이 토큰 (`--height-btn-sm/md/lg`, `--height-input`, `--height-touch`)
  - 폰트 굵기 계층 토큰 (`--weight-normal/medium/semibold/bold`)
  - 유동 타이포그래피 h1~h4 (`clamp()` 적용 — 모바일↔데스크톱 자동 조절)
  - 입력 필드 iOS 줌 방지 (`font-size: max(16px, 1rem)`)
  - 터치 타겟 최소 44px (`min-height: var(--height-touch)`)
  - 태블릿 breakpoint 추가 (`max-width: 1023px`)
  - body 기본 font-size 14→16px
- [x] **이모지 전면 제거 + 폰트 굵기 위계 전환**
  - 사이드바 네비게이션 이모지 제거 (dashboard/my/manager 3개 레이아웃)
  - 활성 메뉴: fontWeight 600, 비활성: 400 (굵기로 위계 표현)
  - 그룹 라벨: fontWeight 700, letterSpacing 0.06em
  - 호버 시 text-second 색상으로 피드백
  - 30개+ 페이지에서 장식용 이모지 제거 (섹션 헤더, 상태 뱃지, 버튼 아이콘 등)
  - StatCard/MiniStat 컴포넌트에서 icon 속성 제거, 라벨 fontWeight 강화
  - MEMO_CATEGORIES, DAY_TYPE_CONFIG, ADVICE_META에서 emoji 필드 삭제
  - 상태 표시 이모지(🟠🟢🔴) → CSS 컬러 닷 span으로 교체
  - **유지**: 자신감 이모지(😊😐😟😎🤔😵), 평가 별점(★)

---

## 완료된 항목 (2026-04-12)

- [x] 실습일지 새벽 5시 보정 + 날짜 드롭다운
- [x] 실습일지 카드 색상 통일 (green-dim → 기본 테마)
- [x] 페이지 제목 fontSize 28px 통일
- [x] 빈 상태(Empty State) 통일 (padding 48, emoji 40, 제목 16)
- [x] 테이블 헤더 padding 통일 (12px 16px)
- [x] 모달 padding 통일 (28px)
- [x] 카드 padding 통일 (24)
- [x] 뱃지 크기 통일 (12px, 2px 10px)
- [x] 날짜 pill → 드롭다운 전환 (출결/교육일지/실습일지/공지사항)
- [x] 필터 버튼 크기 통일 (13px, 6px 14px)
- [x] 드롭다운 크기 통일 (14px, 8px 14px)
- [x] 액션 버튼 ghost 스타일 통일
- [x] 교육효과 헤더 크기/위치 통일
- [x] 서브타이틀 제거 (공지사항/기수관리)
- [x] outer gap 24px 통일 (테스트 32→24, 교육생 32→24, 질문 20→24)
- [x] 사이드바 그룹핑 + "교육생" → "개별분석" 이름 변경

---

## 남은 과제

### 1. 홈 대시보드 리디자인 (우선순위: 높음)

**문제**: 10개 섹션이 한 화면에 다 들어가면서 정보 과부하. 매일 봐야 하는 출결이 홈에 없고, 안 봐도 되는 것들이 공간 차지.

**현재 홈 구성 (위→아래, 좌→우)**:
```
[인사말 + 기수 선택 + D-day]
[타임라인 바]
[출결 요약 카드 5개]        ← 여기서 출결 "요약"만 보임, 오늘 누가 안 왔는지는 안 보임
[주의 교육생 | 오늘 교육일지]
[차시별 평균  | 실습일지 실적]
[평균 추이    | 질문관리    ]
[             | 최근 공지    ]
[             | 최근 답글    ]
```

**제안 방향**:
- "오늘 할 일" 중심으로 재구성: 출결 체크 → 미제출 일지 → 대기 질문 → 주의 교육생
- "최근 공지" 카드 제거 (내가 쓴 걸 내가 볼 필요 없음)
- "평균 추이 차트" 접기 가능하게 (매일 볼 필요 없음)
- "오늘 출결" 위젯 추가 — 미출근/지각자만 빨간색으로 표시
- 2컬럼 비대칭 해소 (오른쪽이 훨씬 길어서 스크롤 불균형)

**구체적 TO-DO**:
- [ ] 홈에 "오늘의 출결" 카드 추가 (미출근/지각자 하이라이트)
- [ ] "최근 공지" 카드 제거
- [ ] "최근 교육생 답글" 카드 → 질문관리 카드에 통합 (답글이 있으면 뱃지로 표시)
- [ ] "평균 추이 차트" 기본 접힘 처리 또는 제거
- [ ] 2컬럼 높이 밸런스 조정

---

### 2. 교육생 상세 페이지 강화 (우선순위: 높음)

**문제**: 한 교육생의 전체 현황을 보려면 6개 페이지를 돌아다녀야 함.

**현재 `/dashboard/students/[id]` 에 있는 것**:
- 기본 정보 (이름, 부서, 매장)
- 적응 지수
- 교육자 메모 (유일하게 여기서만 쓸 수 있음)

**없는 것 (다른 페이지로 가야 함)**:
- 출결 이력 → `/dashboard/attendance` 에서 날짜별 확인
- 시험 성적 → `/dashboard/tests` 에서 확인
- 교육일지 → `/dashboard/education-logs` 에서 학생 필터
- 실습일지 → `/dashboard/practice` 에서 학생 필터
- 질문 이력 → `/dashboard/questions` 에서 스크롤

**제안**:
- [ ] 교육생 상세에 탭 추가: 요약 | 출결 | 시험 | 일지 | 질문
- [ ] 각 탭에서 해당 학생 데이터만 필터링해서 보여주기
- [ ] 또는 최소한 "바로가기 링크" 추가 (출결 보기→, 시험 보기→ 등)

---

### 3. 테스트 + 교육효과 관계 정리 (우선순위: 중간)

**문제**: 둘 다 "시험 성적"을 다른 각도로 분석하는데 별도 페이지. 관리자가 어디를 봐야 할지 혼란.

| 테스트 | 교육효과 |
|--------|---------|
| 차시별 성적 현황 | 주간 수주 금액 추이 |
| 학생별 점수 랭킹 | 주간 전환율 추이 |
| 오답 히트맵 | 교차 분석 (성적↔수주) |
| 차시별 카드 클릭 → 상세 | 교육생별 상관 분석 |

**제안 옵션**:
- A안: 테스트 페이지에 "효과 분석" 탭 추가 → 교육효과 페이지 통합
- B안: 교육효과를 "교육 인사이트"로 리브랜딩 → 교차 분석 전용 페이지로 포지셔닝
- [ ] 둘 중 하나 결정 후 적용

---

### 4. 질문 페이지에 학생 컨텍스트 추가 (우선순위: 중간)

**문제**: 질문에 답변할 때 학생의 상황(출결, 성적, 적응도)을 모름. 맥락 없이 답변하게 됨.

**제안**:
- [ ] 질문 스레드 상단에 학생 미니 프로필 표시 (최근 시험 점수, 출결률, 적응 지수)
- [ ] "개별분석 보기 →" 링크 추가

---

### 5. 코멘트 말풍선 방향 통일 (우선순위: 낮음)

**문제**: 교육일지와 실습일지에서 말풍선 색상/방향이 반대로 되어 있을 수 있음.

**표준 규칙**:
- 관리자(나) = 파란색 말풍선, 오른쪽 정렬
- 학생 = 회색 말풍선, 왼쪽 정렬
- (iMessage 패턴)

**TO-DO**:
- [ ] 교육일지 관리자 뷰 — 말풍선 방향/색상 확인 및 통일
- [ ] 실습일지 관리자 뷰 — 동일하게 확인
- [ ] 학생 뷰 — 반대 방향 (학생이 파란, 관리자가 회색) 확인

---

### 6. 시각적 밀도 개선 (우선순위: 낮음)

**문제**: 일부 카드 내부가 빽빽하고, 일부는 너무 비어 있음.

**대상**:
- [ ] 홈 "주의 교육생" 카드 — 2×2 그리드가 너무 조밀. 정보 정리 필요
- [ ] 홈 요약 카드 5개 — 퇴사자 카드가 항상 보이는데, 퇴사자 0명이면 숨기기
- [ ] 교육일지/실습일지 요약 카드 — padding 16이 본문 카드(24)와 달라서 시각적 불일치

---

### 7. 반응형(모바일) 점검 (우선순위: 낮음)

**현재 상태**: 768px 이하에서 사이드바 숨김 + 1컬럼 전환은 되어 있음.

**TO-DO**:
- [ ] 새로 추가된 드롭다운이 모바일에서 잘 보이는지 확인
- [ ] 사이드바 그룹 라벨이 모바일 드로어에서 잘 보이는지 확인
- [ ] 교육일지에서 제거된 `date-buttons-desktop` / `date-select-mobile` CSS 클래스 정리

---

## UI 표준 값 정리 (레퍼런스)

### 간격 토큰 (8px 그리드)
| 토큰 | 값 | 용도 |
|------|-----|------|
| `--space-1` | 4px | 아이콘↔텍스트 |
| `--space-2` | 8px | 최소 간격 |
| `--space-3` | 12px | 리스트 아이템 |
| `--space-4` | 16px | 카드 내부(모바일) |
| `--space-6` | 24px | 카드 내부(데스크톱) |
| `--space-8` | 32px | 섹션 간 |
| `--space-10` | 40px | 페이지 패딩 |
| `--space-12` | 48px | 대섹션 구분 |

### 컴포넌트 높이
| 토큰 | 값 | 용도 |
|------|-----|------|
| `--height-btn-sm` | 32px | 작은 버튼 |
| `--height-btn-md` | 40px | 기본 버튼 |
| `--height-btn-lg` | 48px | 큰 버튼 |
| `--height-input` | 44px | 입력 필드 |
| `--height-touch` | 44px | 터치 타겟 최소 |

### 폰트 굵기 계층
| 토큰 | 값 | 용도 |
|------|-----|------|
| `--weight-normal` | 400 | 본문, 비활성 메뉴 |
| `--weight-medium` | 500 | 보조 라벨 |
| `--weight-semibold` | 600 | 활성 메뉴, h3~h4, 뱃지 |
| `--weight-bold` | 700 | h1~h2, 그룹 라벨 |

### 유동 타이포그래피 (clamp)
| 요소 | 값 | 모바일↔데스크톱 |
|------|-----|----------------|
| h1 | `clamp(1.75rem, 1.5rem + 1.25vw, 2.5rem)` | 28~40px |
| h2 | `clamp(1.375rem, 1.2rem + 0.75vw, 1.75rem)` | 22~28px |
| h3 | `clamp(1.125rem, 1.05rem + 0.4vw, 1.375rem)` | 18~22px |
| h4 | `clamp(1rem, 0.95rem + 0.25vw, 1.125rem)` | 16~18px |

### 페이지 구조
| 항목 | 값 |
|------|-----|
| outer wrapper | `display: flex, flexDirection: column, gap: 24` |
| h2 제목 | `fontSize: 28, fontWeight: 700, margin: 0` |
| 서브타이틀 | 사용하지 않음 |
| 콘텐츠 패딩 | `32px 40px` (layout.tsx content-wrapper) |

### 카드
| 항목 | 값 |
|------|-----|
| background | `var(--bg-surface)` |
| border | `1px solid var(--border)` |
| borderRadius | `var(--radius-lg)` |
| padding | `20px 24px` |
| boxShadow | `var(--shadow-sm)` |

### 버튼
| 유형 | 스타일 |
|------|--------|
| Ghost (기본 액션) | padding 10px 20px, transparent bg, border 1px var(--border), color var(--text-tertiary), fontSize 14, fontWeight 600 |
| Primary (저장/전송) | padding 10px 20px, var(--blue) bg, #fff color, border none |
| Danger (삭제) | padding 4px 10px, transparent bg, var(--red) color |
| 필터 pill | padding 6px 14px, fontSize 13, radius-sm |

### 드롭다운
| 항목 | 값 |
|------|-----|
| padding | `8px 14px` |
| fontSize | `14` |
| fontWeight | `600` |
| borderRadius | `var(--radius-sm)` |
| border | `1px solid var(--border)` |
| background | `var(--bg-surface)` |

### 뱃지
| 항목 | 값 |
|------|-----|
| fontSize | `12` |
| padding | `3px 10px` |
| borderRadius | `var(--radius-pill)` |
| fontWeight | `600` |

### 빈 상태
| 항목 | 값 |
|------|-----|
| container padding | `48` |
| emoji fontSize | `40` |
| 제목 fontSize | `16, fontWeight 600` |
| 부제 fontSize | `14, color var(--text-muted)` |

### 모달
| 항목 | 값 |
|------|-----|
| overlay | `position: fixed, inset: 0, background: rgba(0,0,0,0.7)` |
| card padding | `28` |
| card borderRadius | `var(--radius-lg)` |
| card background | `var(--bg-elevated)` |

---

## 사이드바 구조 (확정 — 이모지 없음, 폰트 굵기 위계)

```
홈                          ← 활성: fontWeight 600 + 파란 배경

일일 운영                    ← 그룹 라벨: 11px, fontWeight 700, uppercase
  출결                      ← 비활성: fontWeight 400, text-tertiary
  테스트                    ← 호버: bg-hover + text-second
  교육일지
  실습일지
  질문관리

성과 분석
  개별분석
  리포트
  교육효과

심화교육
  심화교육

설정
  공지사항
  기수 관리
```

---

## 수정된 파일 목록 (2026-04-12)

| 파일 | 변경 내용 |
|------|----------|
| `app/my/practice/page.tsx` | 새벽 5시 보정, 날짜 드롭다운, 카드 색상 통일, 뱃지 크기 |
| `app/dashboard/practice/page.tsx` | 카드 색상 통일, 날짜 pill→드롭다운, 드롭다운 크기 |
| `app/my/page.tsx` | 제목 fontSize 26→28 |
| `app/dashboard/reports/ReportsClient.tsx` | 제목 24→28, fontWeight 800→700, 카드 padding 통일 |
| `app/dashboard/attendance/page.tsx` | 빈 상태 통일, 테이블 헤더 padding, 날짜 pill→드롭다운 |
| `app/dashboard/education-logs/page.tsx` | 빈 상태 통일, 날짜 pill→드롭다운, 학생 필터 드롭다운 크기 |
| `app/dashboard/announcements/page.tsx` | 빈 상태 통일, 기수 pill→드롭다운, 서브타이틀 제거 |
| `app/my/announcements/page.tsx` | 빈 상태 통일 |
| `app/dashboard/analytics/AnalyticsClient.tsx` | 테이블 헤더 padding, 헤더 h1→h2 28px, padding 제거, 드롭다운 크기 |
| `app/dashboard/settings/page.tsx` | 모달 padding 32→28, 서브타이틀 제거 |
| `app/dashboard/tests/TestsClient.tsx` | 액션 버튼 ghost 통일, outer gap 32→24 |
| `app/dashboard/students/StudentsClient.tsx` | 제목 "교육생"→"개별분석", outer gap 32→24 |
| `app/dashboard/questions/page.tsx` | 필터 pill 크기 통일, 상태 뱃지 크기, flex gap 구조 변경 |
| `app/my/ask/page.tsx` | 상태 뱃지 크기 통일 |
| `app/dashboard/layout.tsx` | 사이드바 그룹핑 + 이름 변경 |
| `app/api/notes/route.ts` | (변경 없음 — target_date 로직은 이미 지원) |
