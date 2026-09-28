import type { Store } from '../store/types.js'
import type { Health } from '../schema.js'

async function upsert(
  store: Pick<Store, 'readHealth' | 'writeHealth'>,
  source: string,
  patch: Partial<Health>,
  now: Date,
): Promise<void> {
  const rows = await store.readHealth()
  const i = rows.findIndex((r) => r.source === source)
  const base: Health =
    rows[i] ?? {
      source,
      lastSuccessAt: null,
      lastError: null,
      consecutiveFailures: 0,
      updatedAt: now.toISOString(),
    }
  const next: Health = { ...base, ...patch, updatedAt: now.toISOString() }
  if (i >= 0) rows[i] = next
  else rows.push(next)
  await store.writeHealth(rows)
}

export function recordSuccess(
  store: Pick<Store, 'readHealth' | 'writeHealth'>,
  source: string,
  now: Date = new Date(),
): Promise<void> {
  return upsert(
    store,
    source,
    { lastSuccessAt: now.toISOString(), lastError: null, consecutiveFailures: 0 },
    now,
  )
}

/**
 * 실패를 기록하되 lastSuccessAt 은 지우지 않는다.
 * "3일째 실패" 를 알려면 직전 성공 시점이 남아 있어야 한다.
 */
export async function recordFailure(
  store: Pick<Store, 'readHealth' | 'writeHealth'>,
  source: string,
  err: unknown,
  now: Date = new Date(),
): Promise<void> {
  const rows = await store.readHealth()
  const prev = rows.find((r) => r.source === source)?.consecutiveFailures ?? 0
  await upsert(
    store,
    source,
    {
      lastError: err instanceof Error ? err.message : String(err),
      consecutiveFailures: prev + 1,
    },
    now,
  )
}

/**
 * 오늘 쿼터/속도제한(429) 오류가 있었다는 걸 남긴다. `recordFailure`와
 * 별도로 부른다 — `recordSuccess`가 그 둘을 지워도 이 카운터는 남는다.
 * 날짜가 바뀌면 새로 센다.
 */
export async function recordQuotaError(
  store: Pick<Store, 'readHealth' | 'writeHealth'>,
  source: string,
  now: Date = new Date(),
): Promise<void> {
  const rows = await store.readHealth()
  const prevRow = rows.find((r) => r.source === source)
  const today = now.toISOString().slice(0, 10)
  const sameDay = prevRow?.quotaErrorsDate === today
  await upsert(
    store,
    source,
    {
      quotaErrorsToday: (sameDay ? prevRow?.quotaErrorsToday ?? 0 : 0) + 1,
      quotaErrorsDate: today,
    },
    now,
  )
}
