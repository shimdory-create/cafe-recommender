export interface ExtractPromptInput {
  name: string
  sigungu: string
  categoryName: string
  snippets: string[]
  parkingSnippets: string[]
}

/**
 * 프롬프트 판본. `modelVersion` 에 붙어서 저장되므로 이 값을 올리면
 * 재추출 대상을 골라낼 수 있다. 프롬프트를 고칠 때마다 올린다.
 */
export const PROMPT_VERSION = 'p2'

/**
 * Layer 3 추출 프롬프트.
 *
 * 판정 규칙을 명시하는 것이 중요하다. 규칙 없이 물으면 파스타·피자를
 * 파는 곳도 menuLevel 2 로 답한다 (실측 오류).
 *
 * p2 (2026-08-20, 200곳 실측 후): scale·viewStrength·parkingGrade 세 필드에서
 * "모르면 null" 규칙이 무시되고 있었다. 종로구 실측:
 *   · 에이라운드    좌석·층수 언급 0 -> scale "대형"
 *   · 리제로 서울   뷰 언급 0 -> viewStrength 3, viewTypes ["도심"]
 *   · 테라로사 광화문 "1만원 이상 1시간 무료" 건물 지하주차장 -> parkingGrade A
 * 세 건 모두 근거 없이 위로 올려 답한 것이다. 그래서 필드별로 "무엇이
 * 있어야 그 값을 쓸 수 있는지"를 못 박았다. 특히 주차는 게이트이므로
 * 인플레가 곧 헛걸음이 된다 (스펙 15절 성공기준 4).
 */
export function buildExtractPrompt(i: ExtractPromptInput): string {
  const body = i.snippets.length
    ? i.snippets.map((s, n) => `[${n + 1}] ${s}`).join('\n')
    : '(후기 없음)'
  const parking = i.parkingSnippets.length
    ? i.parkingSnippets.map((s, n) => `[P${n + 1}] ${s}`).join('\n')
    : '(주차 언급 없음)'

  return `너는 한국 카페 정보를 구조화하는 도구다. 아래 블로그 후기에서만
근거를 찾아 JSON 으로 답하라.

카페: ${i.name}
지역: ${i.sigungu}
카카오 분류: ${i.categoryName}

--- 블로그 후기 ---
${body}

--- 주차 관련 후기 ---
${parking}

규칙:
1. 후기에 없는 것을 추측하지 마라. 모르면 null 을 쓰고, parkingGrade 는 "?" 를 쓴다.
2. evidence 에는 판단 근거가 된 원문을 그대로 인용하라. 요약하지 마라. 비워두지 마라.
3. parkingEvidence 에도 주차 판단의 근거 원문을 인용하라. 근거가 없으면 빈 문자열.
4. scale: 좌석 100석 이상 또는 2층 이상이면 "대형", 30석 미만이면 "소형", 그 외 "중형".
   **좌석 수·층수·"넓다/대형/규모" 언급 중 아무것도 없으면 null 이다.**
   가격표나 분위기 설명만으로 규모를 추측하지 마라.
5. menuLevel: 1=음료 위주(커피·차·에이드), 2=빵·케이크를 제대로 갖춤,
   3=파스타·피자·샌드위치·브런치플레이트 등 한 끼 식사가 가능.
   식사 메뉴가 하나라도 확인되면 반드시 3 이다.
6. viewStrength: 0=뷰 없음, 3=뷰가 방문 이유가 될 만함, 5=뷰가 압도적.
   **후기에 창밖 풍경·전망·경치에 대한 언급이 없으면 0 이다.**
   "도심에 있다", "역 근처다"는 뷰가 아니다. 실내 인테리어도 뷰가 아니다.
7. viewTypes: 바다·강·호수·산·정원·논밭·도심·창고형·전시 중 해당하는 것.
   viewStrength 가 0 이면 빈 배열이다.
8. parkingGrade — 차로 가는 가족이 헛걸음하지 않는 것이 목적이다. 후하게 주지 마라.
   A = 카페 전용 주차장이 넉넉하다. "주차장 넓다·널널하다", "OO대 가능"(10대 이상),
       "발렛" 처럼 대는 데 문제가 없다고 읽히는 근거가 있을 때만.
   B = 전용이지만 협소(5~9대), 또는 건물·상가 공용 주차장을 쓴다.
       **"1시간 무료", "주문 금액 이상 무료", "주말만 무료" 처럼 조건부·시간제
       무료는 최대 B 다.** 무료 시간이 있다는 것이 넉넉하다는 뜻은 아니다.
   C = 주차 가능 대수가 5대 미만이거나("매장 앞 1~2대"), 인근 유료·공영 주차장에
       의존한다, 또는 "주말에는 자리 없다"는 언급이 있다.
   D = 주차 불가·불가능하다고 명시되었다.
   ? = 주차 언급이 전혀 없다. 모르면 A 가 아니라 "?" 다.
9. teenAppeal: 중고생이 좋아할 요소(사진 스팟, 전시, 디저트)가 많을수록 높게. 0~5.
10. confidence: 후기 정보가 빈약하면 낮게. 0~1.`
}

/** 그물 C — 블로그 큐레이션 글에서 카페 상호명만 뽑는다. */
export function buildHarvestPrompt(regionLabel: string, snippets: string[]): string {
  return `아래는 "${regionLabel}" 카페를 소개하는 블로그 글 조각들이다.
글에서 실제 카페 상호명만 뽑아 JSON 으로 답하라.

${snippets.map((s, n) => `[${n + 1}] ${s}`).join('\n')}

규칙:
1. 상호명만 뽑는다. "대형카페", "베이커리카페", "뷰맛집" 같은 일반어는 제외한다.
2. 지역명("${regionLabel}")을 상호명에 붙이지 마라.
3. 프랜차이즈(스타벅스·투썸·메가커피·이디야·파리바게뜨·뚜레쥬르 등)는 제외한다.
4. 확실하지 않으면 넣지 마라. 적게 뽑는 편이 낫다.
5. 같은 카페가 여러 번 나오면 한 번만 넣는다.`
}

export const RESTAURANT_PROMPT_VERSION = 'r1'

export interface RestaurantExtractPromptInput {
  name: string
  sigungu: string
  categoryName: string
  snippets: string[]
  parkingSnippets: string[]
}

export function buildRestaurantExtractPrompt(i: RestaurantExtractPromptInput): string {
  const body = i.snippets.length
    ? i.snippets.map((s, n) => `[${n + 1}] ${s}`).join('\n')
    : '(후기 없음)'
  const parking = i.parkingSnippets.length
    ? i.parkingSnippets.map((s, n) => `[P${n + 1}] ${s}`).join('\n')
    : '(주차 언급 없음)'

  return `너는 한국 식당 정보를 구조화하는 도구다. 아래 블로그 후기에서만
근거를 찾아 JSON 으로 답하라.

식당: ${i.name}
지역: ${i.sigungu}
카카오 분류: ${i.categoryName}

--- 블로그 후기 ---
${body}

--- 주차 관련 후기 ---
${parking}

규칙:
1. 후기에 없는 것을 추측하지 마라. 모르면 null 을 쓰고, parkingGrade 는 "?" 를 쓴다.
2. evidence 에는 판단 근거가 된 원문을 그대로 인용하라. 요약하지 마라. 비워두지 마라.
3. parkingEvidence 에도 주차 판단의 근거 원문을 인용하라. 근거가 없으면 빈 문자열.
4. cuisineType: 한식/일식/중식/양식/분식/고기구이 중 하나만 고른다.
   메뉴가 뚜렷하게 안 나오면 null 이다. 추측하지 마라.
5. hasRoom: 룸·개별공간·단체석이 있다는 언급이 있으면 true, 명시적으로 없다고
   하면 false, 언급이 없으면 null.
6. reservable: 예약 가능하다는 언급이 있으면 true, "예약 불가"·"웨이팅 필수"
   처럼 명시되면 false, 언급이 없으면 null.
7. viewStrength: 0=뷰 없음, 3=뷰가 방문 이유가 될 만함, 5=뷰가 압도적.
   후기에 창밖 풍경·전망 언급이 없으면 0 이다.
8. viewTypes: 바다·강·호수·산·정원·도심 중 해당하는 것. viewStrength 가 0 이면 빈 배열.
9. parkingGrade — 차로 가는 가족이 헛걸음하지 않는 것이 목적이다. 후하게 주지 마라.
   A = 전용 주차장이 넉넉하다. B = 협소하거나 공용 주차장. "1시간 무료" 처럼
   조건부 무료는 최대 B. C = 5대 미만이거나 인근 유료 주차장 의존.
   D = 주차 불가 명시. ? = 언급 없음.
10. teenAppeal: 중고생이 좋아할 요소가 많을수록 높게. 0~5.
11. confidence: 후기 정보가 빈약하면 낮게. 0~1.`
}

export function buildRestaurantHarvestPrompt(regionLabel: string, snippets: string[]): string {
  return `아래는 "${regionLabel}" 맛집을 소개하는 블로그 글 조각들이다.
글에서 실제 식당 상호명만 뽑아 JSON 으로 답하라.

${snippets.map((s, n) => `[${n + 1}] ${s}`).join('\n')}

규칙:
1. 상호명만 뽑는다. "맛집", "가족외식", "고기집" 같은 일반어는 제외한다.
2. 지역명("${regionLabel}")을 상호명에 붙이지 마라.
3. 프랜차이즈(맥도날드·롯데리아·버거킹·교촌치킨·bhc 등)는 제외한다.
4. 확실하지 않으면 넣지 마라. 적게 뽑는 편이 낫다.
5. 같은 식당이 여러 번 나오면 한 번만 넣는다.`
}
