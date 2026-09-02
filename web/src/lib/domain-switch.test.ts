import { describe, it, expect } from 'vitest'
import { domainOf, switchDomainPath } from './domain-switch'

describe('domainOf', () => {
  it('/restaurant 로 시작하면 restaurant', () => {
    expect(domainOf('/restaurant')).toBe('restaurant')
    expect(domainOf('/restaurant/list')).toBe('restaurant')
  })
  it('그 외는 cafe', () => {
    expect(domainOf('/')).toBe('cafe')
    expect(domainOf('/list')).toBe('cafe')
    expect(domainOf('/cafe/123')).toBe('cafe')
  })
})

describe('switchDomainPath', () => {
  it('홈: / <-> /restaurant', () => {
    expect(switchDomainPath('/', 'restaurant')).toBe('/restaurant')
    expect(switchDomainPath('/restaurant', 'cafe')).toBe('/')
  })
  it('전체 목록: /list <-> /restaurant/list', () => {
    expect(switchDomainPath('/list', 'restaurant')).toBe('/restaurant/list')
    expect(switchDomainPath('/restaurant/list', 'cafe')).toBe('/list')
  })
  it('다녀온 곳: /visited <-> /restaurant/visited', () => {
    expect(switchDomainPath('/visited', 'restaurant')).toBe('/restaurant/visited')
  })
  it('정보: /info <-> /restaurant/info', () => {
    expect(switchDomainPath('/info', 'restaurant')).toBe('/restaurant/info')
  })
  it('상세 페이지는 대응하는 곳이 없으므로 홈으로 보낸다', () => {
    expect(switchDomainPath('/cafe/123', 'restaurant')).toBe('/restaurant')
    expect(switchDomainPath('/restaurant/456', 'cafe')).toBe('/')
  })
  it('이미 그 도메인이면 그대로', () => {
    expect(switchDomainPath('/list', 'cafe')).toBe('/list')
  })
})

describe('domainOf — spot', () => {
  it('/spot 로 시작하면 spot', () => {
    expect(domainOf('/spot')).toBe('spot')
    expect(domainOf('/spot/list')).toBe('spot')
  })
})

describe('switchDomainPath — spot', () => {
  it('홈: / <-> /spot', () => {
    expect(switchDomainPath('/', 'spot')).toBe('/spot')
    expect(switchDomainPath('/spot', 'cafe')).toBe('/')
  })
  it('식당 <-> 가볼 곳도 서로 오간다', () => {
    expect(switchDomainPath('/restaurant/list', 'spot')).toBe('/spot/list')
    expect(switchDomainPath('/spot/visited', 'restaurant')).toBe('/restaurant/visited')
  })
  it('가볼 곳 상세는 대응하는 곳이 없으므로 각 홈으로 보낸다', () => {
    expect(switchDomainPath('/spot/789', 'cafe')).toBe('/')
    expect(switchDomainPath('/cafe/123', 'spot')).toBe('/spot')
  })
})
