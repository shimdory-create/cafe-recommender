import type { NearbyDrivePair } from '../schema.js'

/** 방향 무관 페어 키. pairKeyOf(a,b) === pairKeyOf(b,a) */
export function pairKeyOf(idA: string, idB: string): string {
  return [idA, idB].sort().join(':')
}

/**
 * 캐시 배열을 pairKey -> 항목 Map으로 색인한다.
 *
 * 캐시가 수만 건까지 자란다 — 매번 배열을 순회하면 site 빌드가(하루 여러 번
 * 돈다) 수만×수십 번 선형 탐색을 하게 된다. 호출자가 이 함수로 **한 번만**
 * 색인을 만들고 `lookupPair`에 그 Map을 넘긴다.
 */
export function buildPairIndex(cache: NearbyDrivePair[]): Map<string, NearbyDrivePair> {
  return new Map(cache.map((p) => [p.pairKey, p]))
}

/** 색인에서 두 지점 간 실측 페어를 찾는다. 없으면 null */
export function lookupPair(
  index: Map<string, NearbyDrivePair>,
  idA: string,
  idB: string,
): NearbyDrivePair | null {
  return index.get(pairKeyOf(idA, idB)) ?? null
}
