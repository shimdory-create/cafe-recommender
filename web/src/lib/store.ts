import { githubConfig, readJsonFile, updateJsonFile } from './github-store'

/**
 * 쓰기 저장소. 두 가지 구현이 있고 환경이 고른다.
 *
 *   GitHub  — 배포 환경. Vercel 은 파일 시스템이 읽기 전용이라 이것뿐이다.
 *             데이터가 git 에 남으므로 백업·이력이 공짜로 따라온다.
 *   로컬 파일 — 개발 환경에서 토큰이 없을 때. **동적 import 로만 불러온다** —
 *             파일 시스템 접근이 배포 번들에 들어가면 Turbopack 이 프로젝트
 *             전체를 추적하려 하다 빌드를 실패시킨다 (실측).
 *
 * DB 를 두지 않는 이유는 `github-store.ts` 주석에 적었다 (요지: Supabase
 * 무료 티어는 7일 미사용 시 멈추고, 이 앱은 월 2회 쓴다).
 */
export interface WriteStore {
  read<T>(path: string, revalidate?: number): Promise<T[]>
  update<T>(path: string, message: string, mutate: (rows: T[]) => T[]): Promise<T[]>
  /** 쓰기가 가능한가. false 면 화면이 입력 UI 를 감춘다 */
  readonly enabled: boolean
  readonly kind: 'github' | 'local'
}

function githubStore(cfg: NonNullable<ReturnType<typeof githubConfig>>): WriteStore {
  return {
    enabled: true,
    kind: 'github',
    async read<T>(path: string, revalidate?: number): Promise<T[]> {
      const { rows } = await readJsonFile<T>(cfg, path, revalidate === undefined ? {} : { revalidate })
      return rows
    },
    async update<T>(path: string, message: string, mutate: (rows: T[]) => T[]): Promise<T[]> {
      return updateJsonFile<T>(cfg, path, message, mutate)
    },
  }
}

/**
 * 배포 환경에서 토큰이 없으면 **쓰기가 불가능하다** — Vercel 의 파일 시스템은
 * 읽기 전용이라 로컬 폴백이 500 을 낸다. 그런 경우 `enabled: false` 로 알려
 * 화면이 입력 UI 대신 "아직 설정 전" 을 띄우게 한다. 눌렀는데 실패하는 것보다
 * 아예 안 보이는 것이 낫다.
 */
function disabledStore(): WriteStore {
  return {
    enabled: false,
    kind: 'local',
    async read<T>(): Promise<T[]> {
      return []
    },
    async update<T>(): Promise<T[]> {
      throw new Error('아직 별점 저장이 설정되지 않았어요')
    },
  }
}

export async function writeStore(): Promise<WriteStore> {
  const cfg = githubConfig()
  if (cfg) return githubStore(cfg)
  // VERCEL 은 배포 환경에서 항상 설정된다
  if (process.env.VERCEL) return disabledStore()
  const { localStore } = await import('./store-local')
  return localStore()
}
