import { describe, it, expect } from 'vitest'
import { loadEnv } from '../../src/config/env.js'

const valid = {
  KAKAO_REST_API_KEY: 'kakao-key',
  GEMINI_API_KEY: 'gemini-key',
}

describe('loadEnv', () => {
  it('유효한 값을 통과시킨다', () => {
    expect(loadEnv(valid).KAKAO_REST_API_KEY).toBe('kakao-key')
  })

  it('출발지 좌표를 부평 기본값으로 채운다', () => {
    const env = loadEnv(valid)
    expect(env.HOME_LAT).toBeCloseTo(37.5151091, 4)
    expect(env.HOME_LNG).toBeCloseTo(126.7398273, 4)
  })

  it('좌표를 문자열로 주면 숫자로 변환한다', () => {
    expect(loadEnv({ ...valid, HOME_LAT: '37.1' }).HOME_LAT).toBeCloseTo(37.1, 4)
  })

  it('LLM_PROVIDER 기본값은 gemini 다', () => {
    expect(loadEnv(valid).LLM_PROVIDER).toBe('gemini')
  })

  it('DATA_DIR 기본값은 data 다', () => {
    expect(loadEnv(valid).DATA_DIR).toBe('data')
  })

  it('카카오 키가 빠지면 어떤 키가 문제인지 메시지에 담아 실패한다', () => {
    const { KAKAO_REST_API_KEY: _o, ...rest } = valid
    expect(() => loadEnv(rest)).toThrow(/KAKAO_REST_API_KEY/)
  })

  it('빈 문자열도 누락으로 취급한다', () => {
    // .env 에 KEY= 만 남은 흔한 실수를 잡는다
    expect(() => loadEnv({ ...valid, KAKAO_REST_API_KEY: '' })).toThrow(/KAKAO_REST_API_KEY/)
  })

  it('provider 가 gemini 인데 Gemini 키가 없으면 실패한다', () => {
    expect(() => loadEnv({ KAKAO_REST_API_KEY: 'k' })).toThrow(/GEMINI_API_KEY/)
  })

  it('provider 가 anthropic 이면 Anthropic 키를 요구한다', () => {
    expect(() => loadEnv({ KAKAO_REST_API_KEY: 'k', LLM_PROVIDER: 'anthropic' }))
      .toThrow(/ANTHROPIC_API_KEY/)
  })

  it('anthropic 으로 전환해도 Gemini 키 없이 통과한다', () => {
    // provider-agnostic 설계의 증명 — .env 두 줄로 갈아탄다
    const env = loadEnv({
      KAKAO_REST_API_KEY: 'k', LLM_PROVIDER: 'anthropic', ANTHROPIC_API_KEY: 'a',
    })
    expect(env.LLM_PROVIDER).toBe('anthropic')
  })

  it('알 수 없는 LLM_PROVIDER 를 거부한다', () => {
    expect(() => loadEnv({ ...valid, LLM_PROVIDER: 'openai' })).toThrow(/LLM_PROVIDER/)
  })

  it('네이버·Supabase 키를 요구하지 않는다', () => {
    // v3: 네이버는 신규 발급 불가, Supabase 는 JSON in git 으로 대체
    expect(() => loadEnv(valid)).not.toThrow()
  })
})
