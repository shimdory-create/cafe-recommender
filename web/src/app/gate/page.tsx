import { GateForm } from './gate-form'

export const metadata = { title: '접근 코드 — 우리 가족 카페' }

export default function Gate() {
  return (
    <div className="flex min-h-[70dvh] flex-col justify-center py-10">
      <h1 className="text-[22px] font-bold tracking-tight">우리 가족 카페</h1>
      <p className="mt-2 text-[14px] text-ink-soft">
        가족 접근 코드를 입력하세요. 한 번 넣으면 다시 묻지 않아요.
      </p>
      <GateForm />
    </div>
  )
}
