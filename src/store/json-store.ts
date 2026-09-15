import { readFile, writeFile, mkdir, rename } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'
import {
  CafeSchema,
  BuzzSnapshotSchema,
  VisitSchema,
  SuggestionSchema,
  GoldenLabelSchema,
  ReviewSchema,
  HealthSchema,
  NotifyLogSchema,
  BlacklistEntrySchema,
  NearbyDrivePairSchema,
} from '../schema.js'
import type { Store } from './types.js'

/**
 * 스키마를 제네릭 파라미터로 받는다. `z.ZodType<T>` 로 좁히면 default()
 * 가 붙은 스키마의 입력·출력 타입이 달라 대입이 거부된다.
 */
async function readArray<S extends z.ZodType>(
  dir: string,
  file: string,
  schema: S,
): Promise<z.output<S>[]> {
  const path = join(dir, file)
  if (!existsSync(path)) return []

  const text = await readFile(path, 'utf8')
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch (e) {
    throw new Error(`${file} JSON 파싱 실패: ${(e as Error).message}`)
  }

  const parsed = z.array(schema).safeParse(json)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    const where = first?.path.join('.') || '(최상위)'
    throw new Error(`${file} 스키마 오류 [${where}]: ${first?.message}`)
  }
  return parsed.data as z.output<S>[]
}

async function writeArray(dir: string, file: string, rows: unknown): Promise<void> {
  await mkdir(dir, { recursive: true })
  // 원자적 저장: 임시 파일에 쓰고 rename. 배치가 중간에 죽어도 파일이
  // 반쯤 쓰인 상태로 남지 않는다.
  const tmp = join(dir, `.${file}.tmp`)
  // 들여쓰기 2 + 끝 개행 -> git diff 가 한 줄 단위로 깔끔하게 나온다
  await writeFile(tmp, JSON.stringify(rows, null, 2) + '\n', 'utf8')
  await rename(tmp, join(dir, file))
}

/**
 * 원본 스냅샷 위치. 기본은 `{DATA_DIR}/raw` 지만 `RAW_DIR` 로 옮길 수 있다.
 *
 * 하루 50MB 씩 쌓이는 API 응답이다. 프로젝트가 OneDrive·Dropbox 같은 동기화
 * 폴더 안에 있으면 이 쓰레기가 전부 클라우드로 올라간다 (실측 2일에 276MB).
 * 그럴 때 `RAW_DIR` 를 동기화 밖 경로로 두면 된다.
 */
export function rawDirOf(dataDir: string): string {
  return process.env.RAW_DIR || join(dataDir, 'raw')
}

export function createJsonStore(dataDir: string): Store {
  return {
    readCafes: () => readArray(dataDir, 'cafes.json', CafeSchema),
    writeCafes: (r) => writeArray(dataDir, 'cafes.json', r),

    readBuzz: () => readArray(dataDir, 'buzz.json', BuzzSnapshotSchema),
    writeBuzz: (r) => writeArray(dataDir, 'buzz.json', r),

    readVisits: () => readArray(dataDir, 'visits.json', VisitSchema),
    writeVisits: (r) => writeArray(dataDir, 'visits.json', r),

    readSuggestions: () => readArray(dataDir, 'suggestions.json', SuggestionSchema),
    writeSuggestions: (r) => writeArray(dataDir, 'suggestions.json', r),

    readReviews: () => readArray(dataDir, 'reviews.json', ReviewSchema),
    readGolden: () => readArray(dataDir, 'golden.json', GoldenLabelSchema),
    writeGolden: (r) => writeArray(dataDir, 'golden.json', r),

    readBlacklist: () => readArray(dataDir, 'blacklist.json', BlacklistEntrySchema),

    readHealth: () => readArray(dataDir, 'health.json', HealthSchema),
    writeHealth: (r) => writeArray(dataDir, 'health.json', r),

    readNotifyLog: () => readArray(dataDir, 'notify-log.json', NotifyLogSchema),
    writeNotifyLog: (r) => writeArray(dataDir, 'notify-log.json', r),

    readNearbyDriveCache: () => readArray(dataDir, 'nearby-drive-cache.json', NearbyDrivePairSchema),
    writeNearbyDriveCache: (r) => writeArray(dataDir, 'nearby-drive-cache.json', r),

    async appendRaw(source, query, payload, now = new Date()) {
      const day = now.toISOString().slice(0, 10)
      const dir = join(rawDirOf(dataDir), day)
      await mkdir(dir, { recursive: true })
      const safe = `${source}-${query}`.replace(/[^\w가-힣-]+/g, '_').slice(0, 80)
      const path = join(dir, `${safe}-${now.getTime()}.json`)
      await writeFile(
        path,
        JSON.stringify({ source, query, fetchedAt: now.toISOString(), payload }, null, 2) + '\n',
        'utf8',
      )
      return path
    },
  }
}
