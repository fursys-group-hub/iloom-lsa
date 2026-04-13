# 2026-04-13 — 디자인 시스템 my/manager/dashboard 전체 적용

> DESIGN_SYSTEM.md 18개 규칙을 기준으로 `/my/`, `/manager/`, `/dashboard/` 잔여 위반을 일괄 수정한 작업.

---

## ✅ 오늘 한 것:

### 1. 카드 padding + boxShadow 통일 (13개 파일)
- `padding: 24` → `padding: '20px 24px'` 변경
- `boxShadow: 'var(--shadow-sm)'` 누락 → 추가
- **my/**: page, ask, attendance, notes, practice, tests, announcements (7개)
- **manager/**: page(7곳), growth(4곳), evaluations(2곳), final(2곳)
- **dashboard/**: questions, students/[id]/StudentDetailClient

### 2. 뱃지 통일 (5개 파일, 약 20건)
- `padding: '5px 12px'` / `'2px 8px'` / `'2px 10px'` → **`'3px 10px'`**
- `fontSize: 11` / `13` → **`12`**
- `fontWeight: 700` → **`600`**
- 대상: my/page, my/practice, my/ask, my/attendance, manager/page, StudentDetailClient

### 3. borderRadius 하드코딩 제거 (7개 파일, 약 20건)
- `borderRadius: 2` → `'var(--radius-xs)'` (차트 바, 범례 사각형)
- `borderRadius: 3` → `'var(--radius-xs)'` (진행바, 하이라이트 mark)
- `borderRadius: 4` → `'var(--radius-xs)'` (수정/삭제 버튼, 코드 인라인)
- `borderRadius: 8` → `'var(--radius-sm)'` (Recharts Tooltip, 이미지 모달)
- `borderRadius: 20` → `'var(--radius-pill)'` (출결 상태 뱃지)
- 대상: ask, notes, attendance, overview, tests, students, manager/page, growth

### 4. 테이블 셀 padding 통일 (2개 파일)
- `analytics/AnalyticsClient.tsx`: td `10px 14px` → `12px 16px`, th에 `fontSize: 13, fontWeight: 600, color: var(--text-muted)` 추가
- `education-logs/page.tsx`: th/td `8px 10px` / `8px 12px` → `12px 16px`, th fontSize 12→13, fontWeight 700→600

### 5. 라벨 색상 통일 (2개 파일)
- `color: 'var(--text-second)'` → `'var(--text-tertiary)'` (라벨은 항상 회색)
- 대상: manager/evaluations (labelStyle), manager/final (labelStyle + ScoreSlider)

---

## 🤔 결정한 것:
- **Recharts Bar의 `radius={[4, 4, 0, 0]}`은 유지**: 라이브러리 prop이라 CSS 변수 적용 불가
- **빈 상태 카드 padding(48, 60)은 유지**: DESIGN_SYSTEM.md 카드 규칙과 별개인 Empty State 전용 패딩
- **내부 서브 컴포넌트 padding(14, 16, 20)은 유지**: 카드 안의 내부 요소는 디자인 시스템 "카드" 규칙과 다른 컨텍스트

---

## ⏭️ 다음에 할 것:
- 클릭 가능한 행의 hover 효과 통일 (evaluations 테이블)
- Railway 배포 후 실제 디바이스에서 라이트모드 확인
- 홈 대시보드 리디자인 (감사 리포트 1번 과제)
- 교육생 상세 페이지 강화 (감사 리포트 2번 과제)
