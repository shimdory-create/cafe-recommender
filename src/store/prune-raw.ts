import { readdir, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { existsSync } from 'node:fs'

/**
 * 오래된 원본 스냅샷을 지운다.
 *
 * raw 는 "재수집 없이 재계산" 을 위한 것이지만 git 에 넣지 않으므로 그
 * 효용은 사실상 **같은 날 로컬** 에 한정된다. 하루 약 50MB 씩 쌓이므로
 * 방치하면 디스크를 먹고, 동기화 폴더 안이면 클라우드까지 먹는다.
 *
 * 날짜 폴더 이름(YYYY-MM-DD)으로 판단한다. 파일 mtime 을 훑지 않으므로
 * 수만 개가 쌓여도 빠르다.
 */
export async function pruneRaw(
  rawDir: string,
  opts: { days: number; now?: Date },
): Promise<{ removedDays: string[]; freedBytes: number }> {
  const now = opts.now ?? new Date()
  if (!existsSync(rawDir)) return { removedDays: [], freedBytes: 0 }

  const cutoff = new Date(now.getTime() - opts.days * 86_400_000)
    .toISOString()
    .slice(0, 10)

  const removedDays: string[] = []
  let freedBytes = 0

  for (const name of await readdir(rawDir)) {
    // 날짜 폴더가 아니면 건드리지 않는다
    if (!/^\d{4}-\d{2}-\d{2}$/.test(name)) continue
    if (name >= cutoff) continue

    const dir = join(rawDir, name)
    freedBytes += await dirSize(dir)
    await rm(dir, { recursive: true, force: true })
    removedDays.push(name)
  }

  return { removedDays, freedBytes }
}

async function dirSize(dir: string): Promise<number> {
  let total = 0
  for (const name of await readdir(dir).catch(() => [])) {
    const s = await stat(join(dir, name)).catch(() => null)
    if (!s) continue
    total += s.isDirectory() ? await dirSize(join(dir, name)) : s.size
  }
  return total
}
