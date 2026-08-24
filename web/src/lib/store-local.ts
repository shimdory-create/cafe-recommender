import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { WriteStore } from './store'
import { VIEW_ONLY } from './view-only'

/**
 * 개발용 파일 저장소. **배포 환경에서는 쓰이지 않는다** (`store.ts` 가
 * 동적 import 로만 불러온다).
 *
 * 경로를 위로 훑어 올라가며 찾던 방식은 Turbopack 이 거부한다 —
 * "정적으로 분석할 수 없는 파일 시스템 접근" 이라며 프로젝트 전체를
 * 추적해 번들에 넣으려 하고, 결국 빌드가 실패한다 (실측).
 *
 * 그래서 후보를 두 개로 못박았다. `npm run dev` 는 cwd 가 web 이고,
 * 저장소 루트에서 next 를 직접 띄우면 cwd 가 루트다. 둘 다 리터럴
 * 조합이므로 정적 분석을 통과한다.
 */
const CANDIDATES = [
  join(/* turbopackIgnore: true */ process.cwd(), '..'),
  join(/* turbopackIgnore: true */ process.cwd(), '.'),
]

function repoRoot(): string {
  for (const dir of CANDIDATES) {
    if (existsSync(join(dir, 'data', 'cafes.json'))) return dir
  }
  return CANDIDATES[0]!
}

export function localStore(): WriteStore {
  return {
    enabled: true,
    writable: !VIEW_ONLY,
    kind: 'local',
    async read<T>(path: string): Promise<T[]> {
      try {
        const text = await readFile(join(/* turbopackIgnore: true */ repoRoot(), path), 'utf8')
        const parsed: unknown = JSON.parse(text)
        return Array.isArray(parsed) ? (parsed as T[]) : []
      } catch {
        return []
      }
    },
    async update<T>(path: string, _message: string, mutate: (rows: T[]) => T[]): Promise<T[]> {
      const full = join(/* turbopackIgnore: true */ repoRoot(), path)
      const rows = await this.read<T>(path)
      const next = mutate(rows)
      await mkdir(dirname(full), { recursive: true })
      await writeFile(full, `${JSON.stringify(next, null, 2)}\n`, 'utf8')
      return next
    },
  }
}
