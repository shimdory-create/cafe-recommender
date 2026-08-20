import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { acquireLock, withDataLock, LockBusyError } from '../../src/store/lock.js'

let dir: string
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'cafe-lock-')) })
afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

const NOW = new Date('2026-08-20T23:00:00Z')

describe('acquireLock', () => {
  it('락 파일을 만들고 놓으면 지운다', async () => {
    const release = await acquireLock(dir, 'classify', NOW)
    expect(existsSync(join(dir, '.lock'))).toBe(true)
    await release()
    expect(existsSync(join(dir, '.lock'))).toBe(false)
  })

  it('누가 잡고 있는지 남긴다', async () => {
    await acquireLock(dir, 'classify', NOW)
    const held = JSON.parse(readFileSync(join(dir, '.lock'), 'utf8'))
    expect(held.label).toBe('classify')
    expect(held.pid).toBe(process.pid)
    expect(held.at).toBe(NOW.toISOString())
  })

  it('이미 잡혀 있으면 실패한다 (조용히 덮어쓰지 않는다)', async () => {
    // 나중에 쓴 쪽이 앞선 쪽 작업을 통째로 날리는 것을 막는 것이 목적이다
    await acquireLock(dir, 'classify', NOW)
    await expect(acquireLock(dir, 'drive', NOW)).rejects.toThrow(LockBusyError)
  })

  it('실패 메시지에 누가 잡고 있는지 담는다', async () => {
    await acquireLock(dir, 'classify', NOW)
    await expect(acquireLock(dir, 'drive', NOW)).rejects.toThrow(/classify/)
  })

  it('놓은 뒤에는 다시 잡을 수 있다', async () => {
    const release = await acquireLock(dir, 'classify', NOW)
    await release()
    const again = await acquireLock(dir, 'drive', NOW)
    await again()
  })

  it('두 번 놓아도 괜찮다', async () => {
    const release = await acquireLock(dir, 'classify', NOW)
    await release()
    await expect(release()).resolves.toBeUndefined()
  })

  it('오래된 락은 빼앗는다 (죽은 프로세스가 남긴 것)', async () => {
    // 그러지 않으면 한 번 죽은 뒤 사람이 파일을 지워야 배치가 다시 돈다
    const old = new Date(NOW.getTime() - 60 * 60 * 1000)
    await acquireLock(dir, 'classify', old)
    const release = await acquireLock(dir, 'drive', NOW)
    const held = JSON.parse(readFileSync(join(dir, '.lock'), 'utf8'))
    expect(held.label).toBe('drive')
    await release()
  })

  it('45분이 안 된 락은 빼앗지 않는다', async () => {
    const recent = new Date(NOW.getTime() - 30 * 60 * 1000)
    await acquireLock(dir, 'classify', recent)
    await expect(acquireLock(dir, 'drive', NOW)).rejects.toThrow(LockBusyError)
  })

  it('락 파일이 깨져 있어도 빼앗는다', async () => {
    writeFileSync(join(dir, '.lock'), '{ 깨진 JSON')
    const release = await acquireLock(dir, 'drive', NOW)
    expect(JSON.parse(readFileSync(join(dir, '.lock'), 'utf8')).label).toBe('drive')
    await release()
  })
})

describe('withDataLock', () => {
  it('결과를 그대로 돌려준다', async () => {
    expect(await withDataLock(dir, 'x', async () => 42)).toBe(42)
  })

  it('실패해도 락을 놓는다', async () => {
    await expect(withDataLock(dir, 'x', async () => {
      throw new Error('작업 실패')
    })).rejects.toThrow('작업 실패')
    expect(existsSync(join(dir, '.lock'))).toBe(false)
  })
})
