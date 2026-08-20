import { open, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'

const LOCK_FILE = '.lock'
/** 이보다 오래된 락은 죽은 프로세스가 남긴 것으로 본다 */
const STALE_MS = 45 * 60 * 1000

export class LockBusyError extends Error {
  constructor(public readonly holder: string) {
    super(`다른 작업이 data/ 를 쓰고 있습니다: ${holder}`)
    this.name = 'LockBusyError'
  }
}

/**
 * data/ 쓰기 락.
 *
 * 잡들이 각자 `cafes.json` 전체를 읽고 고쳐서 다시 쓴다. 두 잡이 겹치면
 * **나중에 쓴 쪽이 앞선 쪽의 작업을 통째로 날린다.** 실제로 판정(30분)과
 * 실주행 측정(2분)을 동시에 돌려 실측 298곳을 잃을 뻔했고, GitHub Actions
 * 에서도 daily-classify 와 weekly-drive 가 토요일 20:00 UTC 에 겹친다.
 *
 * `wx` 플래그로 원자적으로 만든다 — 존재 확인 후 생성하면 그 사이에
 * 다른 프로세스가 끼어든다.
 */
export async function acquireLock(
  dataDir: string,
  label: string,
  now: Date = new Date(),
): Promise<() => Promise<void>> {
  const path = join(dataDir, LOCK_FILE)
  const body = JSON.stringify({ label, pid: process.pid, at: now.toISOString() })

  try {
    const fh = await open(path, 'wx')
    await fh.writeFile(body, 'utf8')
    await fh.close()
  } catch (e) {
    if ((e as { code?: string }).code !== 'EEXIST') throw e

    const existing = await readFile(path, 'utf8').catch(() => '')
    const held = safeParse(existing)
    const age = held?.at ? now.getTime() - new Date(held.at).getTime() : Infinity

    if (age < STALE_MS) {
      throw new LockBusyError(`${held?.label ?? '알 수 없음'} (pid ${held?.pid ?? '?'})`)
    }
    // 죽은 프로세스가 남긴 락은 빼앗는다. 그러지 않으면 한 번 죽은 뒤
    // 사람이 파일을 지워야 배치가 다시 돈다.
    await rm(path, { force: true })
    return acquireLock(dataDir, label, now)
  }

  let released = false
  return async () => {
    if (released) return
    released = true
    await rm(path, { force: true })
  }
}

function safeParse(s: string): { label?: string; pid?: number; at?: string } | null {
  try {
    return JSON.parse(s)
  } catch {
    return null
  }
}

/** 락을 잡고 실행하고, 실패해도 반드시 놓는다 */
export async function withDataLock<T>(
  dataDir: string,
  label: string,
  fn: () => Promise<T>,
): Promise<T> {
  const release = await acquireLock(dataDir, label)
  try {
    return await fn()
  } finally {
    await release()
  }
}
