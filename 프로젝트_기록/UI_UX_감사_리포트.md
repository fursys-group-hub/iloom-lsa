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

## 남은 과제 — 진행 현황 (2026-04-14 업데이트)

### 1. ✅ 홈 대시보드 리디자인 (우선순위: 높음) — 완료 (2026-04-14)

> 4/14 홈 대시보드 전면 리디자인에서 전부 해결됨.

- [x] 홈에 "오늘의 출결" 카드 추가 (미출근/지각자 하이라이트) — 출결 요약 + 결석/지각자 이름 뱃지
- [x] "최근 공지" 카드 제거
- [x] "최근 교육생 답글" 카드 → 질문관리 카드에 통합 (답글 N건 뱃지)
- [x] "평균 추이 차트" 제거 (차시별 평균과 중복)
- [x] 2컬럼 높이 밸런스 조정 — 1:1 비율 확정 + 카드 접기/펼치기 5개

**추가 구현**: 교육 일정 달력 (파란 패널+달력 2분할, 할일 메모 Supabase 연동), 차시별 평균 세로 막대 차트, 교육일지 어제/오늘 2컬럼, 실습일지 Sales Funnel 영역 차트

---

### 2. ✅ 교육생 상세 페이지 강화 (우선순위: 높음) — 완료 (2026-04-14)

> 4/14 두 세션에서 탭 추가 → 2열 레이아웃 전면 개편으로 해결됨.

- [x] 교육생 상세에 탭 추가: 요약 | 출결 | 일지 | 질문
- [x] 각 탭에서 해당 학생 데이터만 필터링해서 보여주기
- [x] 이후 탭 → 2열 레이아웃(4:6)으로 전환: 왼쪽(HR조언/적응지수 레이더/출결), 오른쪽(달력+메모/점수 바차트/카테고리+취약/일지/질문)
- [x] 교육생 비교 모드 추가 (2~3명 레이더 차트 겹침 비교)
- [x] "개별분석" → "교육생 분석"으로 메뉴명 변경

---

### 3. ✅ 테스트 + 교육효과 관계 정리 (우선순위: 중간) — 완료 (2026-04-14)

> 재검토 결과: 두 페이지는 목적이 완전히 달라 통합 불필요.
> - **테스트**: 시험 성적 관리 (차시별 점수, 오답 분석, 채점, 동기화)
> - **교육 인사이트**: 교육 프로그램의 실제 효과를 수주 데이터와 교차 분석 ("우리 교육이 진짜 효과 있었나?")

- [x] 별도 유지 확정 — 목적이 다르므로 통합하지 않음
- [x] "교육효과" → **"교육 인사이트"**로 리브랜딩 (사이드바 + 페이지 제목)

---

### 4. ✅ 질문 페이지에 학생 컨텍스트 추가 (우선순위: 중간) — 완료 (2026-04-14)

- [x] 질문 스레드 상단에 학생 미니 프로필 표시 (시험 평균, 출결률, 적응지수) — `/api/student-stats` 경량 API 신규
- [x] 이름 옆 `→` 화살표로 교육생 분석 페이지 이동 링크
- [x] 보관/삭제 버튼 `radius-sm`으로 통일

---

### 5. ✅ 코멘트 말풍선 방향 통일 (우선순위: 낮음) — 완료 (2026-04-14)

> 6개 파일 전수 확인 → 모두 올바름 (수정 불필요).

- [x] 교육일지 관리자 뷰 — 확인 완료
- [x] 실습일지 관리자 뷰 — 확인 완료
- [x] 학생 뷰 — 확인 완료

---

### 6. 🔶 시각적 밀도 개선 (우선순위: 낮음) — 부분 완료

- [x] 홈 "주의 교육생" 카드 — 그리드 gap 6→8px 조정 + 카드 뱃지로 통합 (4/14)
- [ ] 홈 요약 카드 5개 — 퇴사자 카드가 항상 보이는데, 퇴사자 0명이면 숨기기
- [ ] 교육일지/실습일지 요약 카드 — padding 불일치 확인 필요

---

### 7. 🔶 반응형(모바일) 점검 (우선순위: 낮음) — 부분 완료

**현재 상태**: 768px 이하에서 사이드바 숨김 + 1컬럼 전환은 되어 있음.

- [ ] 새로 추가된 드롭다운이 모바일에서 잘 보이는지 확인
- [ ] 사이드바 그룹 라벨이 모바일 드로어에서 잘 보이는지 확인
- [x] 레거시 CSS 클래스 정리 (`date-buttons-desktop`, `date-select-mobile` 제거) — 4/14 완료

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
  교육 인사이트

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
