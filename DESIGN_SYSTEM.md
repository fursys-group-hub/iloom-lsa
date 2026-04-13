# 일룸 LSA 입문교육 — 디자인 시스템 가이드

> **2026-04-13 확정.** 새 페이지나 컴포넌트를 만들 때 반드시 이 문서를 따를 것.
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
