import { z } from 'zod'

/**
 * Gemini `responseSchema` 가 아는 필드만 남긴다.
 *
 * 왜 필요한가 (2026-08-20 실측):
 *   responseMimeType 만 주면  평균 10,005ms, 스키마 통과 0/3
 *   + responseSchema 를 주면  평균  4,833ms, 스키마 통과 3/3
 * 없으면 매 호출이 스키마를 위반해 재시도가 상시 발생한다. 필수다.
 *
 * z.toJSONSchema 출력을 그대로 주면 400 이 난다:
 *   Unknown name "$schema" / Unknown name "additionalProperties"
 */
const KEEP = new Set([
  'type', 'enum', 'items', 'properties', 'required',
  'nullable', 'description', 'format', 'minItems', 'maxItems', 'anyOf',
])

function sanitize(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(sanitize)
  if (node === null || typeof node !== 'object') return node

  const src = node as Record<string, unknown>
  const out: Record<string, unknown> = {}

  for (const [k, v] of Object.entries(src)) {
    if (!KEEP.has(k)) continue

    // zod 의 nullable 은 type: ["string","null"] 로 나온다.
    // Gemini 는 type 배열을 모르므로 nullable 플래그로 옮긴다.
    if (k === 'type' && Array.isArray(v)) {
      const nonNull = v.find((t) => t !== 'null')
      out.type = nonNull ?? 'string'
      if (v.includes('null')) out.nullable = true
      continue
    }

    if (k === 'properties' && v && typeof v === 'object') {
      const p: Record<string, unknown> = {}
      for (const [pk, pv] of Object.entries(v as Record<string, unknown>)) {
        p[pk] = sanitize(pv)
      }
      out.properties = p
      continue
    }

    out[k] = sanitize(v)
  }

  // anyOf 가 [T, null] 형태면 T 로 접고 nullable 로 표시한다.
  if (Array.isArray(out.anyOf)) {
    const branches = out.anyOf as Record<string, unknown>[]
    const nullish = branches.filter((b) => b.type === 'null')
    const real = branches.filter((b) => b.type !== 'null')
    if (real.length === 1) {
      const merged = { ...real[0] } as Record<string, unknown>
      if (nullish.length > 0) merged.nullable = true
      return merged
    }
  }

  return out
}

/** zod 스키마를 Gemini responseSchema 로 변환한다. */
export function zodToGeminiSchema(schema: z.ZodType): unknown {
  const raw = z.toJSONSchema(schema, { target: 'draft-7', io: 'output' })
  return sanitize(raw)
}
