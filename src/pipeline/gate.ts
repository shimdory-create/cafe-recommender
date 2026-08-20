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
  const hard = passesHardGate(input)
  if (!hard.pass) return hard
  if (input.parkingGrade === 'C' && !opts.cityMode) {
    return { pass: false, reason: '주차 C — 도심 모드에서만 노출' }
  }
  // '?' 는 제외하지 않는다. 정보가 없다는 이유로 좋은 곳을 버리지 않고
  // 카드에 "주차 미확인" 배지를 띄운다 (스펙 7.3).
  return { pass: true }
}

/**
 * 되돌릴 수 없는 배제만 판정한다 — 태그 0개와 주차 불가.
 *
 * 판정 잡(classify)은 이것만 써야 한다. 주차 C 를 그 자리에서
 * `excluded_auto` 로 굳히면 **"도심 모드에서만 노출"이 영원히 불가능**해진다.
 * 실측에서 정확히 그 일이 벌어졌다: C 로 배제된 50곳 때문에
 * `npm run suggest -- --city` 가 일반 모드와 똑같은 결과를 냈다 (죽은 옵션).
 * 골든셋에서 오탈락으로 잡힌 공원스크립트("주차장은 조금 협소한 편")도
 * 이 경로였다.
 *
 * 조건부 배제는 상태로 굳히지 않고 **읽는 시점에** 판정한다.
 */
export function passesHardGate(input: GateInput): { pass: boolean; reason?: string } {
  if (input.tags.length === 0) {
    return { pass: false, reason: '동네 카페 (성격 태그 0개)' }
  }
  if (input.parkingGrade === 'D') {
    return { pass: false, reason: '주차 불가 — 차로 갈 수 없다' }
  }
  return { pass: true }
}
