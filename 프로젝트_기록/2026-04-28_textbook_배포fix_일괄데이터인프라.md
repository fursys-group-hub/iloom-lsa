# 2026-04-28 — 교육내용정리 배포 안정화 + 일괄 데이터 인프라

## ✅ 오늘 한 것

전날(4/27) 코펜하겐 챕터 만들고 push 직전에 멈춘 상태에서 시작 — 푸시 → Railway 배포 후 발견된 4가지 누락 fix → 일괄 데이터 인프라 구축으로 이어짐.

### 1. 어제 작업 push (commit `3621391`)

- 41 files changed, 4,846 insertions
- `.gitignore` 보강: `practice-rewrites.json` (학생 실명), `기존자료/` (622MB), `textbook/output/` (5.9MB) 제외
- 교육내용정리 기능 전체 (API 6개, 페이지 3개, 라이브러리 3개, 스크립트 11개)

### 2. Railway 배포 후 4건 fix

#### 🔧 fix #1: 카탈로그 JSON 누락 (commit `e83746e`)

- **증상**: 통합교재 페이지 "판매 시리즈: 0개"
- **원인**: `public/iloom-catalog.json` (94KB)이 단순 untracked 였음 — gitignore 아님, 그냥 add 안 했던 것
- **해결**: 카탈로그 + `public/textbook-images/` 일단 gitignore 추가 (이때 이미지는 미사용으로 잘못 판단)

#### 🔧 fix #2: PostgREST max-rows 1000건 캡 (commit `9076ca8`)

- **증상**: 통계 카드 "분류된 일지: 1,000건" (실제 DB는 1,836건)
- **원인**: Supabase PostgREST가 클라이언트 `.limit(50000)` 설정을 max-rows 1000으로 덮어씀
- **해결**: `.range(from, from+999)` 페이지네이션으로 우회 — `app/api/textbook/route.ts`, `notes-pool/route.ts`
- **검증 도구**: `scripts/check-row-counts.mjs` 추가 — `student_notes` 303 / `classifications` 1,836 / `test_responses` 8,413

#### 🔧 fix #3: 챕터 이미지 깨짐 (commit `51648ba`)

- **증상**: 챕터 색상 칩 31개 모두 X 아이콘
- **원인**: 챕터 HTML이 `/textbook-images/...` 경로 참조하는데 폴더가 gitignore돼있었음 (어제 fix #1에서 잘못 추가)
- **분석 실수**: 처음에 `grep textbook-images`로 코드만 검색 → 미사용 판단. **DB 안 `html_content`까지 확인했어야**
- **해결**: gitignore에서 `public/textbook-images/` 제거 + 31개 파일(16MB) 커밋 + `scripts/check-chapter-images.mjs` 추가

#### 🔧 fix #4: 카탈로그 "스톤 |" → "스톤" (commit `e015ce6`)

- **증상**: 메인 페이지에 "스톤 |" 카드와 "스톤" 카드가 따로 보임 (사용자 발견)
- **원인**: 카탈로그 page_id=22819의 series_name이 "스톤 |"로 잘못 들어감
- **해결**: JSON 파일 직접 수정 — page_id 22819, 40634 둘 다 "스톤"으로 통일 (page_id 다르므로 두 카드 모두 표시됨, 우측은 "온라인" 라벨로 구분)

### 3. 일괄 데이터 인프라 구축 (commit `e015ce6`)

다음 챕터(로이/뉴트/링키플러스 등) 만들 때 사양 정보를 매번 크롤링하지 않고 DB에서 즉시 가져올 수 있게 미리 다 채워놓는 작업.

#### 새 테이블 2개 (`supabase/textbook-bulk.sql`)

**A. `textbook_set_master` — ERP 4,106행**
- PK: (set_code, set_color)
- 컬럼: 세트코드/색상/명칭/품목군/시리즈/판매채널/규격상세
- 시리즈 136개, 시리즈별 평균 30행
- 업로드: `scripts/textbook/upload-set-master.mjs` 1.8초 완료

**B. `textbook_product_guide` — WordPress 5탭 캐시**
- PK: page_id
- 컬럼: tab1~tab5 (각각 JSONB로 본문/표/이미지 모두 보관)
- fetch_status: ok / partial / error 추적
- 일괄 크롤링: `scripts/textbook/fetch-all-product-guides.mjs`
- 옵션: `--force` (전체 재크롤링) / `--resume` (실패만 재시도) / `--limit N` (테스트)

#### 일괄 크롤링 진행

- 테스트 3개: 24초 (시리즈당 8초)
- 전체 175개 백그라운드 실행 시작 — ETA 약 23분
- 시리즈당 평균 ~2,400자 텍스트 + 3개 표 + 20개 이미지 수집됨

## 🤔 결정한 것

- **이미지는 미리 다 안 받음** — 175 × 16MB = 2.8GB라 부담. 챕터 만들 때만 다운로드
- **세트마스터·제품가이드 텍스트만 미리 채움** — 9MB 수준, 한 번 1.5시간 작업으로 끝
- **재실행 안전성** — fetch-all-product-guides.mjs가 이미 ok인 시리즈는 자동 스킵

## ⏭️ 다음에 할 것

1. **크롤링 완료 확인** + 실패 시리즈 `--resume`으로 재시도
2. **Supabase Storage 인프라 구축** — bucket 생성, 챕터 HTML의 이미지 경로 일괄 치환, download-images.mjs를 Storage 모드로 수정
3. **자동 챕터 생성 통합 스크립트** (`generate-chapter.mjs`) — DB에서 사양/제품가이드 즉시 가져와서 HTML 템플릿 자동 채움
4. **우선순위 시리즈 일괄 생성** (로이 → 뉴트 → 링키플러스 → 에디 → 팅클팝)

## 📝 메모: 분석 실수 회고

오늘 fix #3에서 "textbook-images가 코드에서 안 쓰임"이라고 잘못 판단함. 원인은 grep 검색 시 코드 파일만 봤고 DB의 html_content를 안 봤기 때문.

**교훈**: HTML/마크다운/JSON 같은 데이터 필드 안에 들어있는 경로 참조는 grep으로 안 잡힘. 데이터까지 확인해야 함.

---

## 🚀 오후 작업 (11:00 ~ 12:09 KST)

### 4. 카탈로그 크롤러 대폭 개선 (commit `eb6218e` 11:02)

- 일룸 사이트의 **다단 + rowspan 표 구조** 자동 인식: 가상 매트릭스 변환 + 시리즈 셀 위치 동적 감지
- **키즈룸·틴즈룸 / 침실·옷장**의 [구분, 시리즈, 비고] 패턴 처리 → '비고'를 pumok로 사용
- 시리즈명 **잡문자 정제**: 앞뒤 `|`, `ㅣ`, 공백 자동 제거 (`스톤 |` → `스톤` 케이스 자동 해결)
- 괄호 밖 **쉼표 분리**: `오브, 오브플레인` → 두 카드 분리 (괄호 안 쉼표는 보호: `키큰옷장(컬렉트,리디,스톤W)`)

### 5. 카탈로그 큰 그룹 정렬 + 뷰스크 단종 + 인라인 헤더 (commit `25dc354` 11:11)

- 시리즈 셀 위치 기반 패턴 분기: **왼쪽=pumok(큰 그룹), 오른쪽=gubun(sub-헤더)** 일관성 정착
  - 침실·옷장: 침실/매트리스/수납시리즈/옷장/드레스룸 5개 큰 그룹화
  - 키즈룸·틴즈룸: 틴즈룸/키즈룸/의자 3개 큰 그룹화
- **인라인 헤더** 처리: 매트리스 셀 안의 `[헤이븐 HAVEN 시리즈]` / `[데일리 시리즈]` 같은 sub-그룹 라벨 자동 추출
- **수동 단종 보정**: page_id=36220 (뷰스크) — 사이트엔 단종 표기 없지만 단종 처리
- `PUMOK_NORMALIZE`: '침실 (온라인)' → '침실' (큰 그룹 통합, 원래 라벨은 gubun으로 보존)

### 6. 챕터 이미지 Supabase Storage 이전 (commit `8dacec4` 11:16)

- 기존: `public/textbook-images/`가 git에 올라가서 챕터 늘면 GB 단위 부담
- 신규: Supabase Storage `textbook-images` bucket(public)으로 호스팅
- 한글 키 sanitize: 폴더명 시리즈명 → `p<page_id>` (예: 코펜하겐 → p21977), 파일명 한글 제거
- 새 스크립트:
  - `setup-storage.mjs`: bucket 생성 + 일괄 업로드 + 키 매핑 저장
  - `rewrite-chapter-image-paths.mjs`: textbook_chapters.html_content의 `/textbook-images/...` 경로를 Storage URL로 일괄 치환
  - `download-images.mjs`: WordPress에서 받자마자 Storage에 직접 upsert (`--local-only` 디버그 옵션)
- `public/textbook-images/` 다시 gitignore + git rm --cached로 31개 파일 제거 (로컬 파일은 유지)

### 7. 카탈로그 사용자 정의 보정 다수 (commit `6ce5406` 11:20)

`SERIES_OVERRIDES` (page_id 기반 보정):

| page_id | 시리즈 | 변경 |
|---------|--------|------|
| 37110 | 코코 | gubun → '키즈 시리즈' |
| 53742 | 쿠시노 투인원 | gubun → '키즈 시리즈' |
| 62011 | 키큰옷장(컬렉트,리디,스톤W) | series_name → '키큰옷장' |
| 18318 | 쿠시노/쿠시노코지 | 두 카드로 분리 (`split_names`) |
| 39171 | 바젤 | extra_label '모션 포함' (회색 pill) |

`GUBUN_NORMALIZE` (sub-헤더 단순화):
- '호텔 침실 (바젤 : 모션 포함)' → '호텔 침실'
- '헤이븐 HAVEN 시리즈' → '헤이븐 시리즈' (영문 HAVEN 제거)

`page.tsx`: `CatalogSeries.extra_label` 추가, 시리즈명 옆에 회색 pill로 표시.

### 8. sub-품목 메타 수집 + 카드 UI (commit `be2a4ac` 11:34)

**배경**: 에디키즈(p=27067) 같은 시리즈는 안에 sub-품목 페이지(에디키즈 책상/책장/옷장 등 12개)가 링크로 있는데 카드만 봐서는 알 수 없었음.

- DB 스키마: `textbook_product_guide.sub_pages` JSONB 컬럼 신설 (`supabase/textbook-sub-pages.sql`)
- 새 스크립트:
  - `analyze-sub-pages.mjs`: 시리즈 페이지 sub 링크 패턴 디버그 분석
  - `fetch-sub-pages.mjs`: 169개 시리즈 메인 페이지 → sub 링크 추출 → DB 갱신
- 발견 패턴: `h5.wp-block-heading` 안 + `.entry-content/.nv-content-wrap` 안 (GNB/메뉴 제외)
- 카탈로그(is_target)에 없는 page_id만 sub로 간주
- 백그라운드 크롤링 결과: **169/169 성공, 0 실패, 4.6분 소요, sub-페이지 367개 / 73 시리즈**
- API: `/api/textbook` 응답에 `sub_pages_by_pid` 추가
- UI: 카드에 `📦 12품목 책상 · 책장 · 옷장 …` 박스 표시 (이후 단순화)

### 9. 카드 UI 단계적 단순화 (`0e404a4` 11:38 → `f2b0117` 11:39)

- 이모지 (📦) 제거 (UI 정책: 장식용 이모지 금지)
- 미리보기 시리즈명 제거 (줄바꿈으로 카드 높이 들쭉날쭉)
- 별도 박스 → 메타 줄에 인라인 통합 (`일지 23건 · 9품목 · 수정 1시간 전`)
- 슬래시 별칭 합산 (쿠시노/쿠시노코지, 미엘/미엘갤러리: 39건/14건)
- 같은 page_id 다중 시리즈 분리 (sub.title이 시리즈명 포함)

### 10. 카드별 sub 필터링 + 식탁 gubun 통합 (commit `7e7de21` 11:57)

**문제 인식**: 일룸 사이트가 한 시리즈를 너무 specific(세라믹 식탁/원목 식탁)으로 분류. 한 시리즈가 다양한 sub(벤치/유리/세라믹)를 가질 때 단일 gubun으로 묶기 무의미.

- `GUBUN_NORMALIZE` 빈 문자열 매핑 버그 fix (truthy 체크 → `hasOwnProperty`)
- 다이닝룸 식탁 gubun 통합: 세라믹/원목 목재/리빙다이닝 식탁 → 빈값 (한 그룹)
- `subsBySeriesName`: 같은 시리즈명 카드들의 sub_pages 합치기 (레마처럼 사이트가 한 페이지에 sub 몰아둔 경우 대응)
- `PUMOK_KEYWORDS` 사전: 식탁/거실수납장/침실/매트리스/옷장 등 카테고리별 키워드 정의
- 같은 시리즈명 다중 카드: 카드 pumok 키워드로 sub 추가 필터 (레마 식탁 vs 거실수납장 분리)

### 11. 의자 gubun 통합 + N품목 시각 단서 (commit `3a76503` 12:00)

- 다이닝룸 의자: '원목 다리/철제 다리/벤치' → 빈값 (다리 종류 분류 무의미)
- 결과: 의자 17개 한 그룹
- '품목' 글자에 점선 밑줄 + `cursor: help` → hover 가능 영역 인지 시각 단서

### 12. sub 1품목 케이스 숨김 (commit `e38552a` 12:03)

- 1품목 케이스 분석: 거의 모두 시리즈명+한 단어(소프토→소프토 침대 / 비비→비비 테이블 / 리볼라→리볼라 침대) 형태로 시리즈 자체와 본질 동일
- 카드에 1품목 표시는 의미 없음 → 2품목 이상일 때만 표시

### 13. sub owner 매칭 + 키즈룸 sub-헤더 통합 (commit `7a58674` 12:09)

**문제**: 헤이즐 (온라인) 카드에 헤이즐R sub가 들어가는 케이스. `sub.title.includes(시리즈명)`이 너무 광범위.

- 카탈로그의 모든 시리즈명을 길이 내림차순 정렬 → `findSubOwner(subTitle)` = 가장 긴 매칭 시리즈명
- 효과: '헤이즐R 우드헤드 침대' → owner '헤이즐R' (헤이즐 카드엔 안 보임)
- 같은 시리즈명 다중 + 같은 pumok: `is_online_only` / gubun 안 '온라인' 여부로 추가 분리 (헤이즐 일반 vs 헤이즐 온라인)
- 키즈룸·틴즈룸 sub-헤더 통합: 책상/액세서리/침대/키즈 종합/디즈니 콜라보/키즈소파/키즈의자/스터디의자/스툴/옷장 → 빈값
- 결과: 틴즈룸 14 / 키즈룸 9 / 의자 17 — 각자 한 그룹

### 14. 세트마스터 헤이즐R 데이터 보정 (수파베이스 직접 UPDATE)

- 사용자 발견: 헤이즐R 24개 단품 중 14개가 세트마스터에 잘못 (일룸)키즈로 등록 (실제는 침실)
- Supabase JS로 직접 UPDATE: `series_name='헤이즐R' AND pumok_name='(일룸)키즈'` → '(일룸)침실' (14행 변경)
- 결과: 헤이즐R 24개 모두 (일룸)침실로 통합

## 🤔 결정한 것 (오후)

- **카드는 카테고리별 분리 유지** + **sub는 카드별로 다르게 필터링** + **챕터는 시리즈 단위로 통합** (레마 식탁/거실수납장 카드는 양쪽 다 표시 / 식탁 카드 sub: 패밀리 테이블 / 거실수납장 카드 sub: 주방식기장·카페장 / 챕터는 통합)
- **이모지 사용 금지** UI 정책 준수
- **가벼운 sub 메타만 수집** (sub 본문 별도 fetch 안 함, 챕터 작성 시 필요한 것만)
- **세트마스터 데이터 오류 발견 시 SQL UPDATE 한 번으로 보정** (옵션 B)

## ⏭️ 다음에 할 것 (확정)

1. **`generate-chapter.mjs` 통합 스크립트** 제작
   - 입력: 시리즈명
   - 자동 수집: textbook_product_guide / sub_pages / textbook_set_master / textbook_classifications + student_notes
   - Claude가 코펜하겐 챕터 구조 따라 HTML 작성
   - WordPress 이미지 → Storage 업로드 + HTML 경로 치환
   - textbook_chapters upsert
2. **우선순위 시리즈 일괄 챕터 생성**: 로이(98) → 뉴트(70) → 링키플러스(47) → 에디(47) → 에디키즈(45) → 팅클팝(40) → 쿠시노(39) → 모드(38) → 글렌(37) → 링고아이(37)
3. **레마 다이닝룸/주방수납장 카드 추가 검토** (보류 — 결정 받음)
4. **다른 세트마스터 데이터 오류 발견 시 SQL UPDATE 보정**

## 📝 메모: 카탈로그 분류 철학

작업 중 사용자 통찰: 일룸 사이트가 specific 분류(상판 종류 등)로 묶어둔 게 시리즈 본질과 안 맞음. **시리즈는 다양한 sub-품목을 가짐**.

→ 카탈로그 큰 그룹(pumok)은 카테고리 학습용으로 유지, sub-헤더(gubun)는 의미 있는 분류만 남기고 무의미한 분류는 빈값으로 단순화. **카드의 'N품목' 표시로 시리즈 안 다양성을 노출**.
