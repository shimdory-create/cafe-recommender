import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pruneRaw } from '../../src/store/prune-raw.js'

let dir: string
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'cafe-raw-')) })
afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

const NOW = new Date('2026-08-20T12:00:00Z')

const day = (name: string, bytes = 100) => {
  mkdirSync(join(dir, name), { recursive: true })
  writeFileSync(join(dir, name, 'a.json'), 'x'.repeat(bytes))
}

describe('pruneRaw', () => {
  it('보관 기간보다 오래된 날짜 폴더를 지운다', async () => {
    day('2026-08-01')
    day('2026-08-19')
    day('2026-08-20')
    const r = await pruneRaw(dir, { days: 7, now: NOW })
    expect(r.removedDays).toEqual(['2026-08-01'])
    expect(existsSync(join(dir, '2026-08-19'))).toBe(true)
    expect(existsSync(join(dir, '2026-08-20'))).toBe(true)
  })

  it('오늘 것은 절대 지우지 않는다 (같은 날 재계산에 쓴다)', async () => {
    day('2026-08-20')
    const r = await pruneRaw(dir, { days: 0, now: NOW })
    expect(r.removedDays).toEqual([])
    expect(existsSync(join(dir, '2026-08-20'))).toBe(true)
  })

  it('지운 용량을 알려준다', async () => {
    day('2026-08-01', 500)
    day('2026-08-02', 300)
    const r = await pruneRaw(dir, { days: 7, now: NOW })
    expect(r.freedBytes).toBe(800)
  })

  it('날짜 폴더가 아니면 건드리지 않는다', async () => {
    mkdirSync(join(dir, 'keep-me'))
    writeFileSync(join(dir, 'note.txt'), 'x')
    const r = await pruneRaw(dir, { days: 0, now: NOW })
    expect(r.removedDays).toEqual([])
    expect(existsSync(join(dir, 'keep-me'))).toBe(true)
    expect(existsSync(join(dir, 'note.txt'))).toBe(true)
  })

  it('폴더가 없어도 던지지 않는다', async () => {
    const r = await pruneRaw(join(dir, '없음'), { days: 7, now: NOW })
    expect(r).toEqual({ removedDays: [], freedBytes: 0 })
  })

  it('하위 폴더 용량도 센다', async () => {
    mkdirSync(join(dir, '2026-08-01', 'sub'), { recursive: true })
    writeFileSync(join(dir, '2026-08-01', 'sub', 'b.json'), 'y'.repeat(50))
    const r = await pruneRaw(dir, { days: 7, now: NOW })
    expect(r.freedBytes).toBe(50)
  })
})
