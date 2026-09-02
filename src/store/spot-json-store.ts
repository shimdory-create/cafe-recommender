import { readFile, writeFile, mkdir, rename } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'
import { SpotSchema, HealthSchema } from '../spot-schema.js'
import { BuzzSnapshotSchema, SuggestionSchema } from '../schema.js'
import type { Spot, Health } from '../spot-schema.js'
import type { BuzzSnapshot, Suggestion } from '../schema.js'

async function readArray<S extends z.ZodType>(
  dir: string, file: string, schema: S,
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
  const tmp = join(dir, `.${file}.tmp`)
  await writeFile(tmp, JSON.stringify(rows, null, 2) + '\n', 'utf8')
  await rename(tmp, join(dir, file))
}

export function rawDirOf(dataDir: string): string {
  return process.env.RAW_DIR || join(dataDir, 'raw')
}

export interface SpotStore {
  readSpots(): Promise<Spot[]>
  writeSpots(rows: Spot[]): Promise<void>
  readSpotBuzz(): Promise<BuzzSnapshot[]>
  writeSpotBuzz(rows: BuzzSnapshot[]): Promise<void>
  readSpotSuggestions(): Promise<Suggestion[]>
  writeSpotSuggestions(rows: Suggestion[]): Promise<void>
  readHealth(): Promise<Health[]>
  writeHealth(rows: Health[]): Promise<void>
  appendRaw(source: string, query: string, payload: unknown, now?: Date): Promise<string>
}

export function createSpotJsonStore(dataDir: string): SpotStore {
  return {
    readSpots: () => readArray(dataDir, 'spots.json', SpotSchema),
    writeSpots: (r) => writeArray(dataDir, 'spots.json', r),

    readSpotBuzz: () => readArray(dataDir, 'spot-buzz.json', BuzzSnapshotSchema),
    writeSpotBuzz: (r) => writeArray(dataDir, 'spot-buzz.json', r),

    readSpotSuggestions: () => readArray(dataDir, 'spot-suggestions.json', SuggestionSchema),
    writeSpotSuggestions: (r) => writeArray(dataDir, 'spot-suggestions.json', r),

    // health·raw 는 카페·식당과 같은 data/ 를 가리킨다 — 파일도 그대로 공유한다
    readHealth: () => readArray(dataDir, 'health.json', HealthSchema),
    writeHealth: (r) => writeArray(dataDir, 'health.json', r),

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
