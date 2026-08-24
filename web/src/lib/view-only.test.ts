import { describe, expect, it } from 'vitest'
import { hostCanWrite } from './view-only'

describe('hostCanWrite', () => {
  it('가족용 주소에서는 쓸 수 있다', () => {
    expect(hostCanWrite('cafe-recommender-git-master-shim6.vercel.app')).toBe(true)
    expect(hostCanWrite('cafe-recommender-shim6.vercel.app')).toBe(true)
  })

  it('가족용 프로젝트의 미리보기 배포도 허용한다', () => {
    expect(hostCanWrite('cafe-recommender-hxqq9fz9g-shim6.vercel.app')).toBe(true)
  })

  it('열람용 주소에서는 못 쓴다', () => {
    expect(hostCanWrite('cafe-view-shim6.vercel.app')).toBe(false)
    expect(hostCanWrite('cafe-view-git-master-shim6.vercel.app')).toBe(false)
  })

  it('모르는 주소는 거절한다 — 실패했을 때 안전한 쪽으로 넘어진다', () => {
    // 열람용 프로젝트 이름을 무엇으로 짓든 기본이 열람 전용이 된다
    expect(hostCanWrite('cafe-guest-shim6.vercel.app')).toBe(false)
    expect(hostCanWrite('somewhere-else.example.com')).toBe(false)
    expect(hostCanWrite(null)).toBe(false)
    expect(hostCanWrite('')).toBe(false)
  })

  it('개발 환경은 허용한다', () => {
    expect(hostCanWrite('localhost:3000')).toBe(true)
    expect(hostCanWrite('127.0.0.1:3000')).toBe(true)
  })

  it('대소문자와 포트를 무시한다', () => {
    expect(hostCanWrite('CAFE-RECOMMENDER-shim6.vercel.app:443')).toBe(true)
  })

  it('이름을 흉내낸 다른 도메인은 막는다', () => {
    // 접두사만 보므로 `cafe-recommender.evil.com` 은 통과한다. 그건 우리가
    // 그 도메인을 이 프로젝트에 붙였을 때만 도달 가능하므로 문제가 아니다.
    // 반대로 접미사가 다른 것은 확실히 막힌다
    expect(hostCanWrite('evil-cafe-recommender-shim6.vercel.app')).toBe(false)
  })
})
