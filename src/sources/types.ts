export type Fetcher = (url: string, init?: RequestInit) => Promise<Response>

/** 레이트리미터가 돌려주는 함수의 타입. 어댑터가 주입받는다. */
export type Limiter = <T>(fn: () => Promise<T>) => Promise<T>

/**
 * 모든 소스 어댑터가 구현한다. 서로를 모른다 (스펙 6.6 원칙 1).
 * 하나가 죽어도 나머지로 점수를 계산한다.
 */
export interface SourceAdapter<In, Out> {
  readonly name: string
  fetchRaw(input: In): Promise<unknown>
  parse(payload: unknown): Out
}
