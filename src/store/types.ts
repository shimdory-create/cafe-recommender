import type {
  Cafe,
  BuzzSnapshot,
  Visit,
  Suggestion,
  GoldenLabel,
  Review,
  Health,
  BlacklistEntry,
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
   * 원본 응답을 data/raw/YYYY-MM-DD/ 에 적재하고 경로를 돌려준다.
   * 파싱 실패가 데이터 손실이 되지 않게 하고, 점수 공식을 바꿔도
   * 재수집 없이 재계산할 수 있게 한다 (스펙 6.6 원칙 2).
   */
  appendRaw(source: string, query: string, payload: unknown, now?: Date): Promise<string>
}
