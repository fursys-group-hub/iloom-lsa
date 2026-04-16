# 일룸 LSA 입문교육 — 디자인 시스템 가이드

> **2026-04-13 확정 / 2026-04-16 업데이트.** 새 페이지나 컴포넌트를 만들 때 반드시 이 문서를 따를 것.
> 이 문서에 없는 스타일을 임의로 추가하지 말 것 — 추가가 필요하면 이 문서부터 업데이트.

---

## 1. 테마 구조

| 항목 | 값 |
|------|---|
| **기본 테마** | 라이트모드 (`:root` = 라이트) |
| **다크 전환** | `body.dark` 클래스 추가 |
| **토글** | `ThemeToggle.tsx` — localStorage `iloom-theme` |
| **color-scheme** | `html { color-scheme: light; }` / `html:has(body.dark) { color-scheme: dark; }` |

---

## 2. 배경 계층

| 변수 | 라이트 | 다크 | 용도 |
|------|--------|------|------|
| `--bg-main` | `#F7F8FA` | `#0A0A0A` | 페이지 전체 배경 |
| `--bg-surface` | `#FFFFFF` | `#141414` | 카드, 사이드바 배경 |
| `--bg-elevated` | `#F2F3F5` | `#1C1C1E` | 비활성 탭 배경, 내부 영역 |
| `--bg-hover` | `#ECEDF0` | `#242424` | hover 상태 |

> **원칙**: `--bg-main` 위에 `--bg-surface` 카드를 올려서 구분감을 만든다.

---

## 3. 테두리 & 그림자

### 테두리
```css
--border: rgba(0, 0, 0, 0.10);      /* 기본 — "속삭임" 수준 */
--border-light: rgba(0, 0, 0, 0.06); /* 더 연한 구분선 */
```

### 그림자 (다층, 자연광)
```css
--shadow-sm:
  0 1px 2px rgba(0, 0, 0, 0.04),
  0 1px 4px rgba(0, 0, 0, 0.03);

--shadow-md:
  rgba(0, 0, 0, 0.04) 0px 4px 18px,
  rgba(0, 0, 0, 0.027) 0px 2px 8px,
  rgba(0, 0, 0, 0.02) 0px 0.8px 3px,
  rgba(0, 0, 0, 0.01) 0px 0.2px 1px;
```

> **원칙**: 단층 그림자 사용 금지. 항상 다층으로.

---

## 4. 타이포그래피

### 폰트
```
'Pretendard', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif
```

### 기본값
- body: `16px`, `line-height: 1.5`
- **12px 이하 사용 절대 금지** (iOS 줌 방지)

### 제목 — 마이너스 자간 (글씨 클수록 좁게)
| 태그 | 크기 | 굵기 | line-height | letter-spacing |
|------|------|------|-------------|----------------|
| h1 | clamp(1.75rem, ..., 2.5rem) = 28~40px | 700 | 1.1 | **-0.025em** |
| h2 | clamp(1.375rem, ..., 1.75rem) = 22~28px | 700 | 1.2 | **-0.02em** |
| h3 | clamp(1.125rem, ..., 1.375rem) = 18~22px | 600 | 1.3 | **-0.015em** |
| h4 | clamp(1rem, ..., 1.125rem) = 16~18px | 600 | 1.35 | **-0.01em** |

### 폰트 굵기 4단계
| 변수 | 값 | 용도 |
|------|---|------|
| `--weight-normal` | 400 | 본문, 비활성 메뉴 |
| `--weight-medium` | 500 | 보조 라벨, 드롭다운 |
| `--weight-semibold` | 600 | 활성 메뉴, 뱃지, h3~h4 |
| `--weight-bold` | 700 | h1~h2, 큰 숫자 |

---

## 5. 둥글기 (border-radius)

| 변수 | 값 | 용도 |
|------|---|------|
| `--radius-xs` | 4px | 히트맵 셀, 작은 태그 |
| `--radius-sm` | 8px | **탭, 드롭다운, 버튼, 아바타 내부** |
| `--radius-md` | 12px | 모달 내부, 입력 필드 |
| `--radius-lg` | 16px | **카드** |
| `--radius-xl` | 20px | 로그인 카드 |
| `--radius-pill` | 9999px | **뱃지(pill)**, 태그 |

> **원칙**: 하드코딩 `borderRadius: 4` 금지. 반드시 CSS 변수 사용.

---

## 6. 카드

모든 카드 컨테이너에 적용:

```tsx
const cardStyle: React.CSSProperties = {
  background: 'var(--bg-surface)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-lg)',    // 16px
  padding: '20px 24px',                // 상하 20, 좌우 24
  boxShadow: 'var(--shadow-sm)',       // 필수!
};
```

| 속성 | 값 | 비고 |
|------|---|------|
| padding | `20px 24px` | 상하 20, 좌우 24 |
| borderRadius | `var(--radius-lg)` | 16px |
| boxShadow | `var(--shadow-sm)` | 다층 그림자 필수 |
| background | `var(--bg-surface)` | 흰색 |
| border | `1px solid var(--border)` | 속삭임 테두리 |

---

## 7. 뱃지 (Pill Badge)

모든 상태 뱃지, 태그에 적용:

```tsx
const badgeBase: React.CSSProperties = {
  padding: '3px 10px',
  borderRadius: 'var(--radius-pill)',  // 9999px
  fontSize: 12,
  fontWeight: 600,
  whiteSpace: 'nowrap',
};

// 사용 예:
<span style={{ ...badgeBase, background: 'var(--red-dim)', color: 'var(--red)' }}>위험</span>
<span style={{ ...badgeBase, background: 'var(--blue-dim)', color: 'var(--blue)' }}>입문</span>
```

| 속성 | 값 | 비고 |
|------|---|------|
| padding | `3px 10px` | 통일 |
| borderRadius | `var(--radius-pill)` | 완전 둥글게 |
| fontSize | `12` | 통일 (11, 13 사용 금지) |
| fontWeight | `600` | 통일 (700 사용 금지) |

> **색상은 dim 배경 + 원색 텍스트** 조합: `background: var(--red-dim), color: var(--red)`

---

## 8. 탭 (Underline Tab)

밑줄 스타일, 제목 아래 배치:

```
페이지 제목                    액션 버튼들
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
차시별 성적    시험 분석
━━━━━━━━
(바로 내용)
```

```tsx
// 탭 컨테이너
<div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--border)' }}>
  {tabs.map(([key, label], i) => (
    <button key={key} onClick={() => setTab(key)} style={{
      padding: `8px 20px 12px ${i === 0 ? '0px' : '20px'}`,  // 첫 탭 왼쪽 0 (제목과 정렬)
      background: 'transparent',
      color: active === key ? 'var(--text-primary)' : 'var(--text-muted)',
      border: 'none',
      borderBottom: active === key ? '2px solid var(--blue)' : '2px solid transparent',
      fontSize: 15,
      fontWeight: active === key ? 600 : 400,
      cursor: 'pointer',
      transition: 'all 0.15s ease',
      marginBottom: -1,  // 컨테이너 border와 겹치게
    }}>{label}</button>
  ))}
</div>
```

### 탭 규칙
| 규칙 | 설명 |
|------|------|
| **위치** | 페이지 제목 아래, 내용 바로 위 |
| **첫 탭 왼쪽 패딩** | `0px` — 제목과 왼쪽 정렬 맞춤 |
| **활성 표시** | 파란 밑줄 2px (`var(--blue)`) |
| **비활성 텍스트** | `var(--text-muted)`, fontWeight 400 |
| **활성 텍스트** | `var(--text-primary)`, fontWeight 600 |
| **중복 제목 금지** | 탭 이름이 "차시별 성적"이면 아래에 "차시별 성적 현황" 쓰지 않음 |

### 탭이 적합한 경우
- 2개 이상의 **뷰 모드 전환** (차시별 성적 / 시험 분석)
- **필터가 전체 내용을 교체**할 때 (전체 / 답변 대기 / 답변 완료)

### 탭이 부적합한 경우
- 접기/펼치기 패널 → 아코디언 사용
- 데이터 필터 (매장 선택) → 드롭다운 사용
- 편집/미리보기 모드 전환 → 토글 버튼 사용

---

## 9. 드롭다운 (Select)

모든 `<select>` 요소에 적용:

```tsx
style={{
  padding: '8px 14px',
  borderRadius: 'var(--radius-sm)',    // 8px
  border: '1px solid var(--border)',
  background: 'var(--bg-surface)',
  color: 'var(--text-primary)',
  fontSize: 14,
  fontWeight: 600,
  cursor: 'pointer',
  outline: 'none',
}}
```

| 속성 | 값 | 비고 |
|------|---|------|
| padding | `8px 14px` | 통일 |
| borderRadius | `var(--radius-sm)` | 8px |
| fontSize | `14` | 통일 |
| fontWeight | `600` | 통일 |
| background | `var(--bg-surface)` | 흰색 |

> **예외**: 테이블 셀 안의 편집용 select는 `padding: 6px 12px`로 작게 유지.

---

## 10. 아바타 (학생 이름 원형)

### 목록/테이블용 (기본)
```tsx
<span style={{
  width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
  background: 'var(--blue-dim)', color: 'var(--blue)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  fontSize: 13, fontWeight: 700,
}}>{name[0]}</span>
```

### 크기 기준
| 용도 | 크기 | fontSize |
|------|------|----------|
| **목록/테이블** | **32x32** | **13** |
| 프로필 상세 | 56x56 | 22 |
| 심화교육 상세 | 52x52 | 20 |

> **원칙**: 목록에서는 반드시 32x32. 색상은 `blue-dim` + `blue` 통일.
> 자율학습 아바타만 예외적으로 `purple-dim` + `purple` 사용.

---

## 11. 테이블

### 셀 패딩 (통일)
```tsx
// 헤더
<th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 13, fontWeight: 600, color: 'var(--text-muted)' }}>

// 데이터 셀
<td style={{ padding: '12px 16px', color: 'var(--text-second)' }}>
```

| 속성 | 값 |
|------|---|
| th/td padding | `12px 16px` |
| th fontSize | 13 |
| th fontWeight | 600 |
| th color | `var(--text-muted)` |
| td color | `var(--text-second)` |
| 행 구분선 | `borderBottom: '1px solid var(--border)'` |
| hover | `background: 'var(--bg-hover)'` |

---

## 12. 카드 헤더 (제목 + "전체보기 →")

```tsx
// 카드 안의 제목 행
<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
  <h3 style={sectionTitle}>제목</h3>
  <Link href="/path" style={cardLinkStyle}>전체보기 →</Link>
</div>
```

### sectionTitle
```tsx
const sectionTitle: React.CSSProperties = {
  fontSize: 17,
  fontWeight: 700,
  color: 'var(--text-primary)',
  margin: '0 0 16px',
  letterSpacing: '-0.01em',
};
```

### cardLinkStyle (전체보기 →)
```tsx
const cardLinkStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 400,
  color: 'var(--text-muted)',
  textDecoration: 'none',
};
```

> **원칙**: "전체보기 →"는 주요 콘텐츠가 아니므로 연하게 (muted, 12px, 400).

---

## 13. 숫자 카드 (StatCard)

```tsx
// 라벨: 항상 회색 (색상 X)
<span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-tertiary)' }}>{label}</span>

// 숫자: 색상으로 강조
<p style={{ fontSize: 28, fontWeight: 800, color: accent || 'var(--text-primary)' }}>
  {value}
  <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-muted)', marginLeft: 4 }}>{unit}</span>
</p>
```

> **원칙**: 라벨은 항상 회색, 숫자만 색상 적용 (심화교육 패턴).

---

## 14. 필터 버튼 (Pill Toggle)

탭으로 변환하지 않은 필터 버튼:

```tsx
// 활성
{ background: 'var(--blue)', color: '#fff' }

// 비활성
{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-tertiary)' }

// 공통
{ padding: '8px 16px', borderRadius: 'var(--radius-sm)', fontSize: 14, fontWeight: 500 }
```

---

## 15. 사이드바

### 활성 메뉴
```tsx
background: 'var(--blue)',
color: '#fff',
fontWeight: 600,
borderRadius: 'var(--radius-md)',
```

### 비활성 메뉴
```tsx
background: 'transparent',
color: 'var(--text-tertiary)',
fontWeight: 400,
```

### 그룹 라벨 (접기/펼치기)
```tsx
fontSize: 11, fontWeight: 700, color: 'var(--text-muted)',
letterSpacing: '0.06em', textTransform: 'uppercase',
```
- 클릭 시 하위 메뉴 접기/펼치기
- ▼ 화살표 회전 애니메이션
- 현재 보고 있는 페이지가 속한 그룹은 접어도 활성 메뉴 표시

---

## 16. 보조 액션 버튼 (수정, 취소 등)

```tsx
// 테두리 없는 텍스트 버튼
{
  padding: '6px 14px',
  borderRadius: 'var(--radius-sm)',
  border: 'none',                      // 테두리 없음!
  background: 'transparent',
  color: 'var(--text-tertiary)',
  fontSize: 13,
  fontWeight: 500,
  cursor: 'pointer',
}
```

> **원칙**: "수정", "취소" 같은 보조 액션은 테두리 없이 텍스트만. hover 시 진해짐.

---

## 17. 색상 사용 원칙

### 액센트 색상 (6색)
| 변수 | 라이트 | 용도 |
|------|--------|------|
| `--blue` | #3B82F6 | 주요 액션, 활성 탭, 출석 |
| `--green` | #22C55E | 성공, 완료, 출석 |
| `--orange` | #F59E0B | 경고, 지각, 대기 |
| `--red` | #EF4444 | 에러, 결석, 위험 |
| `--purple` | #A855F7 | 심화교육, 자율학습 |
| `--gray-dim` | rgba(107,114,128,0.10) | 비활성 |

### dim 패턴 (뱃지 배경용)
- 배경: `var(--red-dim)` / 텍스트: `var(--red)` — 연한 배경 + 원색 텍스트
- 모든 색상에 `-dim` 변수 제공

### 색상 위계
| 상황 | 색상 사용 |
|------|----------|
| **라벨** (교육 인원, 출석 등) | 항상 회색 (`--text-tertiary`) |
| **숫자** (14명, 13명) | 색상 적용 가능 |
| **뱃지** (위기형, 진행중) | dim 배경 + 원색 텍스트 |
| **전체보기 →** | 연한 회색 (`--text-muted`) |

---

## 17-A. 공통 카드 컴포넌트 — `<SummaryCard>` (2026-04-16 추가)

그리드 카드 리스트 (교육일지/실습일지/교육설문)에서 공통으로 사용. 모든 카드 페이지는 이 컴포넌트로 통일한다.

**위치**: `components/SummaryCard.tsx`

### API
```tsx
<SummaryCard
  date="4/14 (화)"                              // 좌상단 라벨 (날짜/기간)
  typeBadge={{ text: '교육일지', tone: 'blue' }} // 우상단 유형 뱃지
  title="..."                                    // 굵은 메인 제목
  titleSize="default" | "lg" | "xl"              // default(18) | lg(22) | xl(28)
  sub="..."                                      // 보조 텍스트 (3줄 클램프)
  thumbnail={imageUrl}                           // 옵션 — 첫 이미지 (72×72 좌측)
  selected={isSelected}                          // 파란 테두리 강조
  variant="default" | "self-study"               // self-study = 보라 테두리
  onClick={...}                                  // 또는
  href="..."                                     // Link 모드
  disabled={false}
  footerSignals={[                               // 신호 칩 배열 (있을 때만 푸터 노출)
    { type: 'emoji', value: '😊' },
    { type: 'pill', text: '⭐ 우수', tone: 'orange' },
    { type: 'tag', text: '리빙(침실)' },
  ]}
  footerRight={                                  // 우측 — FooterItem 또는 ReactNode
    { type: 'commentCount', count: 3 }
  }
/>
```

### 규격 (고정)
| 속성 | 값 |
|------|---|
| padding | `24px` |
| borderRadius | `var(--radius-lg)` (16px) |
| boxShadow | `var(--shadow-sm)` |
| 내부 gap | `16` |
| 본문 minHeight | `88px` (썸네일 있을 때 본문 정렬 보장) |
| 푸터 구분선 | `1px solid var(--border-light)` + `paddingTop: 12` |

### 정보 위계 원칙 — "신호만 표시"
- **3/3, 100% 같은 "다 채움" 표시는 노이즈** → 푸터에서 숨김
- **미완성/주의 신호만 표시**: `참여 1/3`, `STEP 2/3`, `⭐ 우수`, `💬 N`
- 카테고리 태그는 `#태그` 형태로 작게 (배경 없음)

---

## 17-B. 공통 행 컴포넌트 — `<SummaryRow>` (2026-04-16 추가)

행 리스트 (공지사항/출결)에서 공통으로 사용. 펼치기 가능.

**위치**: `components/SummaryRow.tsx`

### API
```tsx
<SummaryRow
  leftLabel={{ primary: '4/15', secondary: '수요일', secondaryTone: 'red' }}
  badge={{ text: '출근', tone: 'green', dot: true }}     // dot = 컬러 닷 prefix
  title="공지사항 제목..."
  rightSlot={ReactNode}                                   // 우측 자유 (시간/출퇴근 등)
  expandable                                              // 펼치기 토글 가능
  expanded={isOpen}
  onToggle={...}
>
  {/* 펼침 본문 */}
</SummaryRow>
```

### 규격 (고정)
| 속성 | 값 |
|------|---|
| padding | `20px 24px` |
| display | CSS Grid (날짜 88px / 뱃지 auto / 제목 1fr / 우측 auto / 화살표) |
| gap | `20` |
| 날짜 라벨 | `18px / 700 / letter-spacing -0.015em` |
| 날짜 우측 구분선 | `1px solid var(--border-light)` |
| 펼침 본문 배경 | `var(--bg-main)` |

### 2열 그리드 적용 예시 (출결)
```tsx
<div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(440px, 1fr))', gap: 10 }}>
  {items.map(item => <SummaryRow ... />)}
</div>
```

---

## 17-C. 공통 톤 시스템 — `Tone`

`SummaryCard` / `SummaryRow` 모두 같은 톤 enum 사용:

| Tone | 배경 | 텍스트 | 용도 |
|------|------|--------|------|
| `blue` | `--blue-dim` | `--blue` | 일반/공지/사전설문 |
| `orange` | `--orange-dim` | `--orange` | 실습일지/지각/주의 |
| `purple` | `--purple-dim` | `--purple` | 자율학습 |
| `green` | `--green-dim` | `--green` | 완료/출근 |
| `red` | `--red-dim` | `--red` | 긴급/위험 |
| `gray` | `--bg-hover` | `--text-tertiary` | 부가/마감 |

---

## 17-D. 모달/팝업 패턴 (2026-04-16 추가)

카드 클릭 → 상세보기는 **인라인 펼침이 아닌 모달 팝업**으로 통일.

```tsx
<div onClick={() => setOpen(false)} style={{
  position: 'fixed', inset: 0, zIndex: 1000,
  background: 'rgba(0,0,0,0.55)',
  display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
  padding: '40px 20px', overflowY: 'auto',
}}>
  <div onClick={e => e.stopPropagation()} style={{
    position: 'relative', width: '100%', maxWidth: 880,
    background: 'var(--bg-surface)',     // ← 반드시 솔리드 배경 (반투명 X)
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-lg)',
    padding: '28px 32px',
    boxShadow: 'var(--shadow-md)',
  }}>
    <button onClick={...} aria-label="닫기" style={{
      position: 'absolute', top: 16, right: 16, zIndex: 2,
      width: 36, height: 36, minWidth: 36, minHeight: 36, maxWidth: 36, maxHeight: 36,
      boxSizing: 'border-box', padding: 0, margin: 0, flex: 'none',
      borderRadius: '50%', border: 'none',
      background: 'var(--bg-hover)', color: 'var(--text-tertiary)',
      fontSize: 20, lineHeight: '36px', fontWeight: 400, textAlign: 'center', cursor: 'pointer',
    }}>×</button>
    {/* 내용 — 헤더는 paddingRight: 44 로 닫기 버튼 자리 확보 */}
  </div>
</div>
```

**원칙:**
- 모달 배경: 반드시 `--bg-surface` 솔리드 (자율학습 등에 `--purple-dim` 같은 반투명 사용 X)
- 자율학습 모달: 솔리드 배경 + `border: 2px solid var(--purple)`
- 닫기 버튼: 36×36 고정 (min/max width/height 모두 36, lineHeight: '36px') — 글로벌 CSS가 늘리지 못하도록 강제
- 헤더 우측 액션 버튼: `paddingRight: 44` 로 닫기 버튼과 겹치지 않게

---

## 17-E. 카드 그리드 표준 너비 (2026-04-16 추가)

| 페이지 | minmax | 최대 너비 | 사유 |
|--------|--------|-----------|------|
| 교육일지 (많음) | `minmax(360px, 1fr)` | `1280` | 양 많아도 3~4열 |
| 실습일지 (2~4개) | `minmax(380px, 1fr)` | `1280` | 큰 카드 2~3열 |
| 교육설문 (4개 max) | `minmax(360px, 1fr)` | `1280` | 통일감 우선 |

> **원칙**: maxWidth 1280으로 통일. 화면 너무 넓으면 카드 너무 늘어나지 않게.

---

## 18. 하지 말 것 (Anti-patterns)

| 금지 | 대신 |
|------|------|
| `borderRadius: 4` 하드코딩 | `var(--radius-xs)` |
| `borderRadius: 8` 하드코딩 | `var(--radius-sm)` |
| `borderRadius: 12` 하드코딩 | `var(--radius-md)` |
| 단층 그림자 `0 4px 16px rgba(...)` | `var(--shadow-sm)` 또는 `var(--shadow-md)` |
| 카드에 `boxShadow` 없음 | 반드시 `var(--shadow-sm)` 추가 |
| 뱃지 fontSize 11 또는 13 | 반드시 **12** |
| 뱃지 fontWeight 700 | 반드시 **600** |
| 탭을 세그먼트 컨트롤로 | 반드시 **밑줄 탭** |
| 제목 옆에 탭 배치 | 반드시 **제목 아래** |
| 탭 아래에 같은 내용 제목 반복 | **중복 제목 제거** |
| 드롭다운 borderRadius `radius-md` | 반드시 `var(--radius-sm)` |
| 라벨에 색상 적용 | 라벨은 항상 **회색** |
| "수정" 버튼에 테두리 | **테두리 없음**, 텍스트만 |
| 카드 직접 인라인 작성 | `<SummaryCard>` / `<SummaryRow>` 사용 |
| 카드 푸터에 "3/3" 등 완료 표시 | 미완성/주의 신호만 (3/3은 노이즈) |
| 모달 배경 반투명 (`--purple-dim` 등) | 솔리드 `--bg-surface` + 컬러 테두리로 구분 |
| 주차/탭 선택에 둥근 알약 버튼 | 밑줄 탭 (DESIGN_SYSTEM §8) |
