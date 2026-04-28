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

---

## 🌙 저녁 작업 (12:00 ~ 23:00 KST) — 정합성 매핑 + 자동 sceleton + 로이 1:1 작성

### 15. 카탈로그 ↔ 분류 정합성 매핑 (commits `b8e677a` ~ `3ea1a5f`)

`scripts/textbook/system-check.mjs` 신설. 카탈로그 시리즈명과 분류 정규식이 1:1 매칭되는지 점검 도구.

- 결과 1차: 31건 mismatch 발견
- 멘디R: 분류 정규식에 누락 → 추가
- sub-품목에서 '단종' 키워드 들어있는 항목 필터링

### 16. SERIES_OVERRIDES `add_locations` + alias 인식 (commit `acefc32`)

같은 시리즈가 여러 카테고리에 동시 노출되는 케이스 처리:
- 헤이븐: 키즈룸+침실 양쪽 카드 표시
- 별칭(헤이즐 ↔ 헤이즐R) 인식해서 system-check가 통과로 판정

### 17. 1글자 시리즈 + 닛 시리즈명 단순화 (commit `29abc72`)

- 닛 데이베드 같은 1글자 시리즈명을 정규식 매칭에서 누락하던 문제
- 단어 경계(`\b`) 정규식으로 1글자 시리즈도 정확히 매칭
- 닛: 17건 일지 매칭 추가됨

### 18. hidden_in 기능 + 토스티 사이드테이블 (commit `b28d5dd`)

- "업 모션"을 리빙룸에 숨기는 기능 (실제로는 침실 시리즈만 운영)
- `hidden_in: ['리빙룸']` SERIES_OVERRIDE 옵션 신설

### 19. A안 — 한글 공백 정규화 매칭 + 챕터 삭제 기능 (commit `e1c184d`)

- 분류 정규식: `findSeriesInText`에 `stripSpaces` 정규화 → "글렌라이브러리" / "글렌 라이브러리" 둘 다 매칭
- 검수 페이지: 챕터 삭제 버튼 (실수 작성 시 되돌리기)

### 20. series-map.ts 일반 명사 3건 제거 (commit `eb0697f`)

- 바테이블 / 키즈의자 / 통합옷장 — 일반 명사라서 일지에 너무 자주 매칭됨 → 시리즈명에서 제거

### 21. 모든 시리즈 단어 경계 매칭 — 콜로이→로이 부분매칭 차단 (commit `acef174`)

- 사용자 발견: "로이 일지 발췌에 콜로이 일지가 들어감"
- 한글 단어 경계 정규식으로 모든 시리즈 매칭에 적용
- 결과: 정합성 0건, 카탈로그 174 시리즈 100% 일치

### 22. generate-chapter.mjs 자동 챕터 생성 (commits `5a88be9` ~ `eb24bd5`)

- 입력: 시리즈명
- 자동 수집: textbook_product_guide / sub_pages / textbook_set_master / textbook_classifications + student_notes
- 8섹션 sceleton 자동 생성 (코펜하겐 구조 그대로) — 자동 채울 수 있는 부분(타겟·구성·색상 맵)은 채워짐
- 영업 노하우 부분은 placeholder ("Claude가 1:1 작성")
- 데일리라이트 온라인 전용 보정 추가 (사용자 발견)

### 23. 174개 시리즈 sceleton 일괄 자동 생성 (commit `4cc7f67`)

- `generate-all-chapters.mjs`: 174개 일괄 처리
- 결과: 모든 카탈로그 시리즈가 status=draft로 DB에 들어감
- 메인 페이지 카드 174개 모두 "초안" 뱃지로 보임

### 24. PPTX raw text dump 섹션 제거 (commits `7111f70`, `9b72ffc`, `afec354`)

- 사용자 피드백: "이렇게만 보여주면 어떻게 해. 이미지 파일로 보여줘야지"
- chapter-auto.html에서 PPTX raw text dump 제거
- 자동 색상 옵션(전체) 섹션도 제거: SPGY/OSPW 등 조합 코드는 영업에 무의미

### 25. 로이 1:1 챕터 작성 + 신규 워크플로우 스크립트 (commit `6b41b19`)

- chapter-claude.html (32KB) 직접 작성
- 신규 스크립트:
  - `collect-series-data.mjs`: 단일 시리즈 4소스 통합 수집 → all-data.json
  - `fetch-sub-page-details.mjs`: sub 페이지 상세 본문 추가 크롤링
  - `merge-chapter-with-spec.mjs`: chapter-claude.html + auto 사양 머지 → DB upsert (status=reviewing)
- 사용자 피드백 반영:
  - 코드 외우기 강요 → 호환성 표로 전환 ("애들은 지금 코드 외울 때가 아니잖아")
  - "가로 공간 효율" 모호 → 인과 설명으로 ("측면 패널로 받침 → 양 옆 막힘 → 좁은 방")
  - 견적/안전등급/실측 → 인과 흐름 한 섹션으로 통합
  - 1400 vs 1447 차이 명시 (책상장은 책상보다 약간 더 넓음)

### 26. 색상/소재 통합 라이브러리 + lightbox (commit `e79b4cc`)

**공유 라이브러리 구축:**
- `lib/color-chips.ts`: 6색 (SP/OS/GU/GY/LU/DN) Storage URL 매핑 — 모든 시리즈 공유
- `lib/material-images.ts`: 60개 소파 패브릭/가죽 코드 (4L2 블러쉬 등) Storage URL — 노션 export 자동 변환
- 신규 스크립트:
  - `setup-color-library.mjs add <코드> <storage_key>` → colors/{코드}.{ext} 생성 + 라이브러리 자동 갱신
  - `setup-material-library.mjs`: 노션 export → Storage materials/ + lib/material-images.ts 일괄 업로드

**검수 페이지 개선:**
- 클릭 시 lightbox로 큰 이미지 확대 (img.cursor-zoom-in 자동 처리)
- 갤러리 이미지 사이즈 통일: aspect-ratio:1/1 + object-fit:cover

**사용자 피드백:**
- "이미지가 왜 안 들어가져 있어?!" → 다운로드 파이프라인 누락 발견 → 모든 챕터에 적용
- "소재 사진도 넣었어?!" → 패브릭 60종 라이브러리 추가
- "사이즈 다 동일하게 해줘야 해. 너무 왔다갔다" → aspect-ratio 적용
- "색상은 동일하게 나중에도 사용될 수 있어" → 공유 라이브러리 분리
- "사진 눌렀을 때 크게 보이게" → lightbox 추가
- "코펜하겐 보면 위에서 아래가 아니라 왼쪽에서 오른쪽으로" → 색상표 가로 정렬

### 27. 메인 페이지 카드 상태별 색상 분기 (commit `05fc37d`)

- 사용자 피드백: "검수/편집 말고, 초안작성중(회색) / 검수중(파란색) / 완료(초록색) 어때?"
- `STATUS_BUTTON` 매핑: draft 회색 / reviewing 파란 / final 초록
- 우상단 "초안" 뱃지 제거 (버튼 색상으로 충분히 구분)
- 자동화로 끌고 온 sceleton과 1:1 작성 카드가 시각적으로 즉시 구분됨

### 28. 자동화 파이프라인 가이드 문서 (commit `5ec7154`)

`docs/교육내용정리-자동화-가이드.md` 신설:
- 다른 세션이 그대로 따라할 수 있게 9개 섹션 (골든 스탠다드 / 5단계 자동화 / 작성 가이드 / "우선순위 시리즈 자동으로 진행해" 흐름 / 사이트 구조 케이스 / DB 스키마 / 스크립트 cheat sheet / 절대 잊지 말 것 / 다음 세션 시작 멘트)
- "이미지 빼먹지 말 것" 두 번 강조 (수지님이 매번 재차 지적한 항목)
- CLAUDE.md에 textbook automation 섹션 추가
- 메모리에 `project_textbook_automation.md` 등록 → 다른 세션 자동 인지

### 29. 영업 시나리오 기반 8섹션 재구조화 (commit `c3049d1`)

**배경**: 사용자가 "PPTX와 비교해 빠진 거 있나" 점검 요청 → PPTX 슬라이드 113~128 + 227, 228, 232, 233, 240 추출 → AS 기간·LINAK 모터·가방걸이 운영·책상 배치 3패턴·로이뮤트 등 영업 핵심 디테일 빠진 게 발견됨.

**기존 8섹션의 문제 진단:**
- ⭐ 제품 특장점 비대 (책상/색상/페르소나/vs 다 들어감)
- 🎯 헷갈리는 포인트 ↔ 💡 실전 팁 도어 규칙 겹침
- vs 시리즈가 두 군데로 흩어짐
- AS·멀티탭·가방걸이가 한 곳에 모이지 않음
- 책상 배치 3패턴 자리 없음

**새 8섹션 (영업 응대 흐름):**
1. 📋 한눈에 보기 — 한 문장 정의 + 메타 표
2. 🪑 라인업 — 책상 4종 / 책상장·적층장 / 책장 / 옷장 (제품 구조 중심)
3. 🔌 매장 영업 빈출 Q&A — AS / 멀티탭 / 가방걸이 / 배치 3패턴 / 사이즈 유의
4. 💡 견적·시공 실전 — 안전등급 → 도어 부착 → 익스텐션 시공 → 실측 체크리스트
5. 🌈 색상·조합 가이드 — 6색 + 베이스+액세서리 + 로이뮤트
6. 🎯 시험·매장 빈출 헷갈리는 포인트 — 사이즈 / 호환성 / 1400 vs 1447 / 책장 도어
7. 🎯 vs 다른 학생방 시리즈 — 종합 비교 + 로이 vs 로이모노 상세 표 + 페르소나
8. 🚨 단종·주의·매장 영업 필수 안내 — 8개 체크리스트 + 마무리 멘트

**로이 chapter-claude.html 새 구조로 재작성**: 32KB → **49.2KB** (PPTX 영업 디테일 통합)

**가이드 문서 갱신:**
- §0에 PPTX 비교 단계 + 새 8섹션 트리 추가
- §2 섹션별 작성법 새 구조에 맞춰 재작성
- §3 self-check에 PPTX 영업 디테일 누락 검증 8개 항목 신설

## 🤔 결정한 것 (저녁)

- **카드 상태 시각 구분**: 자동화 sceleton과 1:1 작성을 색상으로 즉시 구분 → 진행 상황 한눈에
- **공유 라이브러리 (색상·소재)**: 시리즈마다 매번 업로드하지 말고 한 번만 등록 후 모든 시리즈 공유
- **8섹션 재구조화 (영업 흐름)**: 매장 응대 순서대로 → 새 시리즈 작성 시 그대로 적용
- **PPTX 비교 필수화**: 가이드 §0에 작성 전 단계로 명시 → 다음 시리즈도 빠짐없이
- **자동화 가이드 문서**: 다른 세션이 "우선순위 시리즈 자동으로 진행해" 한 마디로 끝까지 가도록 매뉴얼화

## ⏭️ 다음에 할 것 (확정)

1. **우선순위 시리즈 1:1 작성** (뉴트 → 링키플러스 → 에디 → 에디키즈 → 팅클팝)
   - 가이드 §3 "우선순위 시리즈 자동으로 진행해" 흐름 그대로
   - PPTX 비교 단계 필수
   - 새 8섹션 구조 + 모든 영업 디테일 포함
2. **다른 시리즈 이미지 처리 파이프라인 적용** (현재 로이만 이미지 풍부, 나머지는 sceleton만)
3. **사이즈 도면 이미지 처리** — PPTX의 도면 슬라이드도 챕터에 넣을지 검토

## 📝 메모: 사용자 피드백 패턴 (다음 시리즈에도 적용)

오늘 받은 핵심 피드백 정리:

| 피드백 | 적용 방법 |
|--------|----------|
| "왜"를 설명하라 | 모든 수치/구조 옆에 인과 한 줄 |
| 코드 외우기 강요 X | 호환성 표로 전환 |
| 인과 흐름 통합 | 안전등급 → 실측 한 섹션 |
| 이미지 사이즈 통일 | aspect-ratio:1/1 + object-fit:cover |
| 색상 가로 정렬 | 위→아래 X, 왼쪽→오른쪽 O |
| 공유 가능한 자료 분리 | colors/, materials/ Storage 라이브러리 |
| 시각적 구분 강화 | 카드 상태별 색상 (회색/파란/초록) |
| 매장 영업 디테일 빠짐 | PPTX 비교로 자동 감지 (가이드 §0) |
