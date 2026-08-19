import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import { createGemini } from '../../src/llm/gemini.js'
import { createAnthropic } from '../../src/llm/anthropic.js'
import { createLlm } from '../../src/llm/index.js'
import type { Limiter } from '../../src/sources/types.js'

const Schema = z.object({ scale: z.string(), evidence: z.string().min(1) })
const passthrough: Limiter = (fn) => fn()

const geminiReply = (text: string) =>
  new Response(
    JSON.stringify({
      candidates: [{ content: { parts: [{ text }] } }],
      usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 },
    }),
    { status: 200 },
  )

const ok = (obj: unknown) => geminiReply(JSON.stringify(obj))

describe('createGemini', () => {
  it('구조화 출력을 파싱해 돌려준다', async () => {
    const llm = createGemini({
      apiKey: 'k', limit: passthrough,
      fetcher: async () => ok({ scale: '대형', evidence: '200석' }),
    })
    expect(await llm.extract({ prompt: 'p', schema: Schema }))
      .toEqual({ scale: '대형', evidence: '200석' })
  })

  it('별칭이 아니라 고정 버전을 호출한다', async () => {
    // gemini-flash-latest 는 실측에서 HTTP 503 을 반환했다
    let url = ''
    const llm = createGemini({
      apiKey: 'k', limit: passthrough,
      fetcher: async (u) => { url = u; return ok({ scale: '대형', evidence: 'e' }) },
    })
    await llm.extract({ prompt: 'p', schema: Schema })
    expect(url).toContain('gemini-3.1-flash-lite')
    expect(url).not.toContain('latest')
  })

  it('x-goog-api-key 헤더로 인증한다', async () => {
    let key = ''
    const llm = createGemini({
      apiKey: 'secret', limit: passthrough,
      fetcher: async (_u, init) => {
        key = (init?.headers as Record<string, string>)['x-goog-api-key']!
        return ok({ scale: '대형', evidence: 'e' })
      },
    })
    await llm.extract({ prompt: 'p', schema: Schema })
    expect(key).toBe('secret')
  })

  it('마크다운 코드펜스로 감싸 와도 파싱한다', async () => {
    const llm = createGemini({
      apiKey: 'k', limit: passthrough,
      fetcher: async () => geminiReply('```json\n{"scale":"대형","evidence":"e"}\n```'),
    })
    expect((await llm.extract({ prompt: 'p', schema: Schema })).scale).toBe('대형')
  })

  it('스키마 위반이면 재시도한다', async () => {
    let n = 0
    const llm = createGemini({
      apiKey: 'k', limit: passthrough,
      fetcher: async () => {
        n++
        return n === 1
          ? ok({ scale: '대형', evidence: '' }) // evidence 빈 문자열 -> 위반
          : ok({ scale: '대형', evidence: 'ok' })
      },
    })
    const r = await llm.extract({ prompt: 'p', schema: Schema, maxRetries: 2 })
    expect(r.evidence).toBe('ok')
    expect(n).toBe(2)
  })

  it('재시도 프롬프트에 위반 내용을 담는다', async () => {
    const bodies: string[] = []
    let n = 0
    const llm = createGemini({
      apiKey: 'k', limit: passthrough,
      fetcher: async (_u, init) => {
        bodies.push(String(init?.body))
        n++
        return n === 1 ? ok({ scale: '대형', evidence: '' }) : ok({ scale: '대형', evidence: 'ok' })
      },
    })
    await llm.extract({ prompt: 'p', schema: Schema, maxRetries: 2 })
    expect(bodies[1]).toContain('evidence')
  })

  it('재시도를 다 써도 실패하면 던진다', async () => {
    const llm = createGemini({
      apiKey: 'k', limit: passthrough,
      fetcher: async () => ok({ scale: '대형', evidence: '' }),
    })
    await expect(llm.extract({ prompt: 'p', schema: Schema, maxRetries: 2 }))
      .rejects.toThrow(/스키마/)
  })

  it('escalateTo 를 주면 재시도에서 상위 모델로 올린다', async () => {
    const urls: string[] = []
    let n = 0
    const llm = createGemini({
      apiKey: 'k', limit: passthrough,
      fetcher: async (u) => {
        urls.push(u); n++
        return n === 1 ? ok({ scale: '대형', evidence: '' }) : ok({ scale: '대형', evidence: 'ok' })
      },
    })
    await llm.extract({
      prompt: 'p', schema: Schema, maxRetries: 2, escalateTo: 'gemini-3.6-flash',
    })
    expect(urls[0]).toContain('gemini-3.1-flash-lite')
    expect(urls[1]).toContain('gemini-3.6-flash')
  })

  it('JSON 이 아니면 재시도한다', async () => {
    let n = 0
    const llm = createGemini({
      apiKey: 'k', limit: passthrough,
      fetcher: async () => {
        n++
        return n === 1 ? geminiReply('죄송합니다, 답변할 수 없습니다')
                       : ok({ scale: '대형', evidence: 'ok' })
      },
    })
    expect((await llm.extract({ prompt: 'p', schema: Schema, maxRetries: 2 })).scale).toBe('대형')
  })

  it('HTTP 오류를 상태코드가 담긴 SourceError 로 던진다', async () => {
    const llm = createGemini({
      apiKey: 'k', limit: passthrough,
      fetcher: async () => new Response('{"error":{"message":"overloaded"}}', { status: 503 }),
    })
    await expect(llm.extract({ prompt: 'p', schema: Schema })).rejects.toMatchObject({ status: 503 })
  })

  it('modelVersion 을 노출한다 (재처리 판단용)', () => {
    const llm = createGemini({ apiKey: 'k', limit: passthrough, fetcher: async () => ok({}) })
    expect(llm.modelVersion).toBe('gemini-3.1-flash-lite')
    expect(llm.name).toBe('gemini')
  })
})

describe('createAnthropic', () => {
  const anthropicReply = (text: string) =>
    new Response(JSON.stringify({ content: [{ text }] }), { status: 200 })

  it('같은 인터페이스로 동작한다 (provider 교체 증명)', async () => {
    const llm = createAnthropic({
      apiKey: 'k', limit: passthrough,
      fetcher: async () => anthropicReply('{"scale":"대형","evidence":"e"}'),
    })
    expect((await llm.extract({ prompt: 'p', schema: Schema })).scale).toBe('대형')
    expect(llm.name).toBe('anthropic')
  })

  it('앞뒤 설명이 붙어도 JSON 블록을 찾아낸다', async () => {
    const llm = createAnthropic({
      apiKey: 'k', limit: passthrough,
      fetcher: async () => anthropicReply('네, 다음과 같습니다:\n{"scale":"중형","evidence":"e"}\n이상입니다.'),
    })
    expect((await llm.extract({ prompt: 'p', schema: Schema })).scale).toBe('중형')
  })
})

describe('createLlm', () => {
  const deps = { fetcher: async () => ok({ scale: '대형', evidence: 'e' }), limit: passthrough }

  it('기본값은 gemini 다', () => {
    expect(createLlm({ LLM_PROVIDER: 'gemini', GEMINI_API_KEY: 'g' }, deps).name).toBe('gemini')
  })

  it('anthropic 으로 갈아탄다', () => {
    expect(createLlm({ LLM_PROVIDER: 'anthropic', ANTHROPIC_API_KEY: 'a' }, deps).name)
      .toBe('anthropic')
  })

  it('키가 없으면 어떤 키인지 알려주며 실패한다', () => {
    expect(() => createLlm({ LLM_PROVIDER: 'gemini' }, deps)).toThrow(/GEMINI_API_KEY/)
    expect(() => createLlm({ LLM_PROVIDER: 'anthropic' }, deps)).toThrow(/ANTHROPIC_API_KEY/)
  })
})
