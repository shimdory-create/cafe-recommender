export interface ExtractPromptInput {
  name: string
  sigungu: string
  categoryName: string
  snippets: string[]
  parkingSnippets: string[]
}

/**
 * Layer 3 추출 프롬프트.
 *
 * 판정 규칙을 명시하는 것이 중요하다. 규칙 없이 물으면 파스타·피자를
 * 파는 곳도 menuLevel 2 로 답한다 (실측 오류).
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
5. menuLevel: 1=음료 위주(커피·차·에이드), 2=빵·케이크를 제대로 갖춤,
   3=파스타·피자·샌드위치·브런치플레이트 등 한 끼 식사가 가능.
   식사 메뉴가 하나라도 확인되면 반드시 3 이다.
6. viewStrength: 0=뷰 없음, 3=뷰가 방문 이유가 될 만함, 5=뷰가 압도적.
7. viewTypes: 바다·강·호수·산·정원·논밭·도심·창고형·전시 중 해당하는 것.
8. parkingGrade: A=전용 주차장 넉넉, B=전용이나 협소, C=인근 유료·공영 의존,
   D=주차 불가, ?=후기에 언급 없음.
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
