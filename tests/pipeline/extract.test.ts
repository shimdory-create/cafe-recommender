import { describe, it, expect } from 'vitest'
import { buildExtractPrompt, buildHarvestPrompt } from '../../src/llm/prompts.js'
import { extractAttributes } from '../../src/pipeline/extract.js'
import type { LlmClient } from '../../src/llm/types.js'

const input = {
  name: '테라로사 서종점',
  sigungu: '양평군',
  categoryName: '음식점 > 카페',
  snippets: ['2층 통창에 좌석 200석 넘어요', '직접 굽는 빵이 많아요'],
  parkingSnippets: ['전용 주차장 50대 이상, 주말에도 여유'],
}

describe('buildExtractPrompt', () => {
  it('상호·지역·스니펫을 프롬프트에 담는다', () => {
    const p = buildExtractPrompt(input)
    expect(p).toContain('테라로사 서종점')
    expect(p).toContain('양평군')
    expect(p).toContain('2층 통창에 좌석 200석')
    expect(p).toContain('전용 주차장 50대')
  })

  it('evidence 인용을 명시적으로 요구한다', () => {
    expect(buildExtractPrompt(input)).toMatch(/인용/)
  })

  it('추측 금지를 명시한다', () => {
    // 환각 방지. 근거 없으면 null / ? 를 쓰게 한다.
    expect(buildExtractPrompt(input)).toMatch(/추측하지/)
  })

  it('menuLevel 판정 규칙을 명시한다', () => {
    // 규칙이 없으면 파스타·피자가 있어도 Lv2 로 답한다 (실측 오류)
    const p = buildExtractPrompt(input)
    expect(p).toContain('파스타')
    expect(p).toMatch(/menuLevel/)
  })

  it('주차 스니펫이 없으면 그 사실을 알린다', () => {
    expect(buildExtractPrompt({ ...input, parkingSnippets: [] })).toContain('주차 언급 없음')
  })

  it('스니펫에 번호를 붙여 구분한다', () => {
    const p = buildExtractPrompt(input)
    expect(p).toContain('[1]')
    expect(p).toContain('[2]')
    expect(p).toContain('[P1]')
  })
})

describe('buildHarvestPrompt', () => {
  it('지역명과 스니펫을 담고 일반어 제외를 지시한다', () => {
    const p = buildHarvestPrompt('경기 양평군', ['양평 대형카페 BEST'])
    expect(p).toContain('경기 양평군')
    expect(p).toContain('양평 대형카페 BEST')
    expect(p).toMatch(/일반어|제외/)
  })

  it('프랜차이즈 제외를 지시한다', () => {
    expect(buildHarvestPrompt('경기 양평군', ['x'])).toMatch(/스타벅스|프랜차이즈/)
  })
})

const goodAttrs = {
  scale: '대형', seatsEstimate: 200, floors: 2,
  hasBakery: true, breadBakedOnsite: true, bakerySignal: '직접 굽는 빵',
  menuLevel: 3, mealTypes: ['파스타'], signatureMenu: null,
  viewStrength: 3, viewTypes: ['강'], outdoorSeating: true,
  parkingGrade: 'A', parkingEvidence: '전용 주차장 50대 이상',
  photoSpot: 4, teenAppeal: 3, stayDuration: null,
  confidence: 0.85, evidence: '2층 통창에 좌석 200석 넘어요',
}

const fakeLlm = (result: unknown, version = 'gemini-3.1-flash-lite'): LlmClient => ({
  name: 'fake',
  modelVersion: version,
  extract: async () => result as never,
})

describe('extractAttributes', () => {
  it('LLM 결과에 추출 시각과 모델 버전을 붙인다', async () => {
    const r = await extractAttributes(
      { llm: fakeLlm(goodAttrs), now: new Date('2026-08-20T00:00:00Z') },
      input,
    )
    expect(r.modelVersion).toBe('gemini-3.1-flash-lite')
    expect(r.extractedAt).toBe('2026-08-20T00:00:00.000Z')
    expect(r.scale).toBe('대형')
    expect(r.parkingGrade).toBe('A')
  })

  it('LLM 이 준 extractedAt 을 신뢰하지 않는다', async () => {
    // 모델이 날짜를 발명하는 것을 막는다
    const withBogus = { ...goodAttrs, extractedAt: '1999-01-01T00:00:00.000Z', modelVersion: '가짜' }
    const r = await extractAttributes(
      { llm: fakeLlm(withBogus), now: new Date('2026-08-20T00:00:00Z') },
      input,
    )
    expect(r.extractedAt).toBe('2026-08-20T00:00:00.000Z')
    expect(r.modelVersion).toBe('gemini-3.1-flash-lite')
  })

  it('evidence 가 비면 스키마가 거부한다', async () => {
    await expect(
      extractAttributes({ llm: fakeLlm({ ...goodAttrs, evidence: '' }) }, input),
    ).rejects.toThrow()
  })

  it('escalateTo 를 상위 모델로 넘긴다', async () => {
    let seen: string | undefined
    const llm: LlmClient = {
      name: 'fake', modelVersion: 'v',
      extract: async (o) => { seen = o.escalateTo; return goodAttrs as never },
    }
    await extractAttributes({ llm }, input)
    expect(seen).toBe('gemini-3.6-flash')
  })
})
