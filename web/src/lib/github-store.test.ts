import { describe, it, expect, vi, afterEach } from 'vitest'
import { githubConfig, readJsonFile, updateJsonFile } from './github-store'

const cfg = { token: 't', repo: 'me/cafe', branch: 'master' }

const b64 = (s: string) => Buffer.from(s, 'utf8').toString('base64')
const contents = (rows: unknown, sha = 'sha1') =>
  new Response(JSON.stringify({ content: b64(JSON.stringify(rows)), sha }), { status: 200 })

afterEach(() => {
  vi.unstubAllGlobals()
  delete process.env.GITHUB_TOKEN
  delete process.env.GITHUB_REPO
  delete process.env.GITHUB_BRANCH
})

describe('githubConfig', () => {
  it('환경변수가 없으면 null (읽기 전용으로 돈다)', () => {
    expect(githubConfig()).toBeNull()
  })

  it('토큰만 있고 저장소가 없으면 null', () => {
    process.env.GITHUB_TOKEN = 't'
    expect(githubConfig()).toBeNull()
  })

  it('브랜치 기본값은 master', () => {
    process.env.GITHUB_TOKEN = 't'
    process.env.GITHUB_REPO = 'me/cafe'
    expect(githubConfig()).toEqual({ token: 't', repo: 'me/cafe', branch: 'master' })
  })

  it('브랜치를 바꿀 수 있다', () => {
    process.env.GITHUB_TOKEN = 't'
    process.env.GITHUB_REPO = 'me/cafe'
    process.env.GITHUB_BRANCH = 'main'
    expect(githubConfig()!.branch).toBe('main')
  })
})

describe('readJsonFile', () => {
  it('base64 를 풀어 배열을 준다', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => contents([{ a: 1 }])))
    const r = await readJsonFile<{ a: number }>(cfg, 'data/x.json')
    expect(r.rows).toEqual([{ a: 1 }])
    expect(r.sha).toBe('sha1')
  })

  it('파일이 없으면 빈 배열 + sha null (첫 쓰기에서 만든다)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 404 })))
    expect(await readJsonFile(cfg, 'data/x.json')).toEqual({ rows: [], sha: null })
  })

  it('토큰과 브랜치를 요청에 담는다', async () => {
    let url = ''
    let auth = ''
    vi.stubGlobal('fetch', vi.fn(async (u: string, init?: RequestInit) => {
      url = u
      auth = (init?.headers as Record<string, string>).Authorization!
      return contents([])
    }))
    await readJsonFile(cfg, 'data/x.json')
    expect(url).toBe('https://api.github.com/repos/me/cafe/contents/data/x.json?ref=master')
    expect(auth).toBe('Bearer t')
  })

  it('합치기 전에는 캐시를 쓰지 않는다', async () => {
    // 캐시된 sha 로 쓰면 항상 409 가 난다
    let init: RequestInit | undefined
    vi.stubGlobal('fetch', vi.fn(async (_u: string, i?: RequestInit) => {
      init = i
      return contents([])
    }))
    await readJsonFile(cfg, 'data/x.json')
    expect((init as { cache?: string }).cache).toBe('no-store')
  })

  it('배열이 아니면 빈 배열로 본다', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => contents({ not: 'array' })))
    expect((await readJsonFile(cfg, 'data/x.json')).rows).toEqual([])
  })

  it('JSON 이 깨졌으면 실패한다 (덮어써서 잃지 않는다)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(JSON.stringify({ content: b64('{ 깨진'), sha: 's' }), { status: 200 })))
    await expect(readJsonFile(cfg, 'data/x.json')).rejects.toThrow(/깨졌/)
  })

  it('다른 오류는 상태코드를 담아 던진다', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 401 })))
    await expect(readJsonFile(cfg, 'data/x.json')).rejects.toThrow(/401/)
  })
})

describe('updateJsonFile', () => {
  it('읽고 고쳐서 쓴다', async () => {
    const calls: { method: string; body?: unknown }[] = []
    vi.stubGlobal('fetch', vi.fn(async (_u: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET'
      calls.push({ method, body: init?.body ? JSON.parse(init.body as string) : undefined })
      return method === 'GET' ? contents([{ id: 'a' }]) : new Response('{}', { status: 200 })
    }))

    const next = await updateJsonFile<{ id: string }>(
      cfg, 'data/x.json', '메시지', (rows) => [...rows, { id: 'b' }],
    )
    expect(next).toEqual([{ id: 'a' }, { id: 'b' }])

    const put = calls.find((c) => c.method === 'PUT')!.body as Record<string, string>
    expect(put.message).toBe('메시지')
    expect(put.sha).toBe('sha1')
    expect(Buffer.from(put.content!, 'base64').toString('utf8'))
      .toBe(`${JSON.stringify([{ id: 'a' }, { id: 'b' }], null, 2)}\n`)
  })

  it('sha 가 없으면 sha 를 보내지 않는다 (새 파일 생성)', async () => {
    let put: Record<string, unknown> = {}
    vi.stubGlobal('fetch', vi.fn(async (_u: string, init?: RequestInit) => {
      if ((init?.method ?? 'GET') === 'GET') return new Response('', { status: 404 })
      put = JSON.parse(init!.body as string)
      return new Response('{}', { status: 200 })
    }))
    await updateJsonFile(cfg, 'data/x.json', 'm', (rows) => [...rows, 1])
    expect('sha' in put).toBe(false)
  })

  it('충돌하면 다시 읽어 합친다', async () => {
    // 두 사람이 동시에 별점을 남기는 경우. 나중 쓰기가 앞선 것을 지우면 안 된다.
    let gets = 0
    let puts = 0
    vi.stubGlobal('fetch', vi.fn(async (_u: string, init?: RequestInit) => {
      if ((init?.method ?? 'GET') === 'GET') {
        gets++
        // 두 번째 읽기에서는 다른 사람의 후기가 이미 들어와 있다
        return contents(gets === 1 ? [{ id: 'a' }] : [{ id: 'a' }, { id: 'other' }])
      }
      puts++
      return puts === 1 ? new Response('conflict', { status: 409 }) : new Response('{}', { status: 200 })
    }))

    const next = await updateJsonFile<{ id: string }>(
      cfg, 'data/x.json', 'm', (rows) => [...rows, { id: 'mine' }],
    )
    expect(next.map((r) => r.id)).toEqual(['a', 'other', 'mine'])
    expect(gets).toBe(2)
  })

  it('계속 충돌하면 사람이 읽을 수 있는 오류를 준다', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_u: string, init?: RequestInit) =>
      (init?.method ?? 'GET') === 'GET'
        ? contents([])
        : new Response('conflict', { status: 409 })))
    await expect(updateJsonFile(cfg, 'data/x.json', 'm', (r) => r))
      .rejects.toThrow(/다시 시도/)
  })

  it('권한 오류는 재시도하지 않고 바로 알린다', async () => {
    let puts = 0
    vi.stubGlobal('fetch', vi.fn(async (_u: string, init?: RequestInit) => {
      if ((init?.method ?? 'GET') === 'GET') return contents([])
      puts++
      return new Response('no permission', { status: 403 })
    }))
    await expect(updateJsonFile(cfg, 'data/x.json', 'm', (r) => r)).rejects.toThrow(/403/)
    expect(puts).toBe(1)
  })
})
