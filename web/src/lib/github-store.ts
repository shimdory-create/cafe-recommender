/**
 * GitHub 저장소를 데이터베이스로 쓴다.
 *
 * 왜 DB 를 두지 않는가:
 *   · Supabase 무료 티어는 **7일 미사용 시 프로젝트가 멈춘다.** 이 앱은
 *     월 2회 쓰므로 대부분의 시간이 미사용이다 — 누르려는 순간 정지 상태를
 *     만나고 사람이 대시보드에서 복구해야 한다. 사용 패턴과 정면으로 어긋난다
 *   · 데이터가 이미 전부 git 에 있다. 별점도 같은 곳에 두면 백업·이력·복구가
 *     공짜로 따라온다. 서비스가 죽어도 데이터는 남는다
 *   · 계정도 대시보드도 쿼터 감시도 늘지 않는다
 *
 * 쓰기는 Contents API 로 한다. 같은 파일을 두 명이 동시에 고치면 GitHub 이
 * `sha` 불일치로 409 를 주므로, 다시 읽어 합치고 재시도한다 — 이것이
 * 트랜잭션 대신이다.
 */

const API = 'https://api.github.com'

export interface GithubConfig {
  token: string
  /** "owner/repo" */
  repo: string
  branch: string
}

/** 환경변수가 없으면 null — 쓰기 기능을 감추고 읽기 전용으로 돈다 */
export function githubConfig(): GithubConfig | null {
  const token = process.env.GITHUB_TOKEN
  const repo = process.env.GITHUB_REPO
  if (!token || !repo) return null
  return { token, repo, branch: process.env.GITHUB_BRANCH || 'master' }
}

interface FileState<T> {
  rows: T[]
  sha: string | null
}

function headers(cfg: GithubConfig) {
  return {
    Authorization: `Bearer ${cfg.token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  }
}

/**
 * 파일을 읽는다. 없으면 빈 배열 + sha null (첫 쓰기에서 생성한다).
 *
 * `cache: 'no-store'` 를 쓰는 이유: 합치기 전에는 반드시 최신을 읽어야
 * 한다. 캐시된 sha 로 쓰면 항상 409 가 난다.
 */
export async function readJsonFile<T>(
  cfg: GithubConfig,
  path: string,
  opts: { revalidate?: number } = {},
): Promise<FileState<T>> {
  const url = `${API}/repos/${cfg.repo}/contents/${path}?ref=${cfg.branch}`
  const res = await fetch(url, {
    headers: headers(cfg),
    ...(opts.revalidate === undefined
      ? { cache: 'no-store' as const }
      : { next: { revalidate: opts.revalidate } }),
  })

  if (res.status === 404) return { rows: [], sha: null }
  if (!res.ok) throw new Error(`GitHub 읽기 실패 ${res.status}: ${(await res.text()).slice(0, 200)}`)

  const body = (await res.json()) as { content?: string; sha?: string; encoding?: string }
  if (!body.content) return { rows: [], sha: body.sha ?? null }

  const text = Buffer.from(body.content, 'base64').toString('utf8')
  let rows: T[] = []
  try {
    const parsed: unknown = JSON.parse(text)
    if (Array.isArray(parsed)) rows = parsed as T[]
  } catch {
    // 손으로 편집한 파일이 깨졌을 수 있다. 덮어써서 데이터를 잃는 것보다
    // 실패하는 편이 낫다.
    throw new Error(`${path} JSON 이 깨졌습니다`)
  }
  return { rows, sha: body.sha ?? null }
}

async function putJsonFile<T>(
  cfg: GithubConfig,
  path: string,
  rows: T[],
  sha: string | null,
  message: string,
): Promise<boolean> {
  const res = await fetch(`${API}/repos/${cfg.repo}/contents/${path}`, {
    method: 'PUT',
    headers: { ...headers(cfg), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message,
      // 2칸 들여쓰기 + 끝 개행 — git diff 를 깨끗하게 (스펙 9절)
      content: Buffer.from(`${JSON.stringify(rows, null, 2)}\n`, 'utf8').toString('base64'),
      branch: cfg.branch,
      ...(sha ? { sha } : {}),
    }),
  })

  // 409/422 = 그사이 누가 먼저 썼다. 다시 읽어 합쳐야 한다.
  if (res.status === 409 || res.status === 422) return false
  if (!res.ok) throw new Error(`GitHub 쓰기 실패 ${res.status}: ${(await res.text()).slice(0, 200)}`)
  return true
}

/**
 * 읽고-고치고-쓰기를 충돌 시 재시도한다.
 *
 * `mutate` 는 **순수 함수여야 한다** — 재시도하면 다시 호출되므로, 부수효과가
 * 있으면 두 번 일어난다.
 */
export async function updateJsonFile<T>(
  cfg: GithubConfig,
  path: string,
  message: string,
  mutate: (rows: T[]) => T[],
  attempts = 3,
): Promise<T[]> {
  let lastError: Error | null = null
  for (let i = 0; i < attempts; i++) {
    const { rows, sha } = await readJsonFile<T>(cfg, path)
    const next = mutate(rows)
    try {
      if (await putJsonFile(cfg, path, next, sha, message)) return next
    } catch (e) {
      lastError = e as Error
      break
    }
  }
  throw lastError ?? new Error(`${path} 저장이 계속 충돌했습니다. 잠시 후 다시 시도하세요.`)
}
