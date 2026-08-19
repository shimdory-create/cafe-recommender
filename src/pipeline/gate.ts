export interface GateInput {
  tags: string[]
  parkingGrade: 'A' | 'B' | 'C' | 'D' | '?'
}

/**
 * Layer 5 — 최종 게이트 (스펙 7.6).
 *
 * "동네 카페 = 성격 태그 0개" 가 조작적 정의다. 별도 판별기를 만들지 않는다.
 * 넣고 싶은 것의 정의를 명확히 하면 뺄 것은 자동으로 정의되며, 9번째
 * 태그를 추가해도 이 함수를 고칠 일이 없다.
 */
export function passesGate(
  input: GateInput,
  opts: { cityMode?: boolean } = {},
): { pass: boolean; reason?: string } {
  if (input.tags.length === 0) {
    return { pass: false, reason: '동네 카페 (성격 태그 0개)' }
  }
  if (input.parkingGrade === 'D') {
    return { pass: false, reason: '주차 불가 — 차로 갈 수 없다' }
  }
  if (input.parkingGrade === 'C' && !opts.cityMode) {
    return { pass: false, reason: '주차 C — 도심 모드에서만 노출' }
  }
  // '?' 는 제외하지 않는다. 정보가 없다는 이유로 좋은 곳을 버리지 않고
  // 카드에 "주차 미확인" 배지를 띄운다 (스펙 7.3).
  return { pass: true }
}
