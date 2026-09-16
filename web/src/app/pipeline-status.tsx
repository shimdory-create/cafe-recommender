/**
 * 정보 탭 상단에 보이는 파이프라인 상태 한 줄.
 *
 * `usage-watch.ts`의 `statusLine()`이 만드는 문자열을 그대로 받아 색만 입힌다 —
 * 새 판정 로직을 웹에 만들지 않는다. 접두어 세 가지("자동수집 정상"/"점검
 * 필요:"/"주의:")로만 톤을 가른다.
 */
function toneOf(status: string): 'ok' | 'alert' | 'warn' {
  if (status.startsWith('점검 필요')) return 'alert'
  if (status.startsWith('주의')) return 'warn'
  return 'ok'
}

const TONE_CLASS: Record<'ok' | 'alert' | 'warn', string> = {
  ok: 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300',
  warn: 'bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300',
  alert: 'bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-300',
}

export function PipelineStatus({ status }: { status: string }) {
  return (
    <p className={`mt-3 rounded-2xl px-4 py-3 text-[13px] font-semibold leading-relaxed ${TONE_CLASS[toneOf(status)]}`}>
      {status}
    </p>
  )
}
