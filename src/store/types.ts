import type {
  Cafe,
  BuzzSnapshot,
  Visit,
  Suggestion,
  GoldenLabel,
  Review,
  Health,
  BlacklistEntry,
  NotifyLog,
  NearbyDrivePair,
} from '../schema.js'

/**
 * 저장소 경계.
 *
 * 지금은 JSON in git 이지만 이 인터페이스 뒤에 두었으므로 나중에 DB로
 * 옮길 때 구현체만 갈아끼우면 된다 (스펙 v3 9절).
 */
export interface Store {
  readCafes(): Promise<Cafe[]>
  writeCafes(cafes: Cafe[]): Promise<void>

  readBuzz(): Promise<BuzzSnapshot[]>
  writeBuzz(rows: BuzzSnapshot[]): Promise<void>

  readVisits(): Promise<Visit[]>
  writeVisits(rows: Visit[]): Promise<void>

  readSuggestions(): Promise<Suggestion[]>
  writeSuggestions(rows: Suggestion[]): Promise<void>

  /** 가족 별점. 웹앱이 GitHub 에 쓰고 파이프라인이 읽는다 (쓰기는 웹 담당) */
  readReviews(): Promise<Review[]>

  readGolden(): Promise<GoldenLabel[]>
  writeGolden(rows: GoldenLabel[]): Promise<void>

  readBlacklist(): Promise<BlacklistEntry[]>

  readHealth(): Promise<Health[]>
  writeHealth(rows: Health[]): Promise<void>

  /**
   * 카카오톡 발송 기록. 발송은 이 PC 에서 나가므로 클라우드가 알 수 없다 —
   * 한 줄을 커밋해두면 감시가 "지난주에 안 나갔다" 를 잡는다.
   */
  readNotifyLog(): Promise<NotifyLog[]>
  writeNotifyLog(rows: NotifyLog[]): Promise<void>

  /**
   * 근처 추천 2단계 페어 캐시. 카페·식당·가볼 곳 어느 도메인 것도 아니라서
   * (셋을 가로지르는 데이터) health·notifyLog와 같은 자리(base Store)에만 둔다.
   */
  readNearbyDriveCache(): Promise<NearbyDrivePair[]>
  writeNearbyDriveCache(rows: NearbyDrivePair[]): Promise<void>

  /**
   * 원본 응답을 data/raw/YYYY-MM-DD/ 에 적재하고 경로를 돌려준다.
   * 파싱 실패가 데이터 손실이 되지 않게 하고, 점수 공식을 바꿔도
   * 재수집 없이 재계산할 수 있게 한다 (스펙 6.6 원칙 2).
   */
  appendRaw(source: string, query: string, payload: unknown, now?: Date): Promise<string>
}
