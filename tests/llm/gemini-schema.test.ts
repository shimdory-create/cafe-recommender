import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import { zodToGeminiSchema } from '../../src/llm/gemini-schema.js'
import { CafeAttributesSchema } from '../../src/schema.js'

type Obj = Record<string, any>

describe('zodToGeminiSchema', () => {
  it('Gemini 가 모르는 필드를 제거한다', () => {
    // z.toJSONSchema 출력을 그대로 주면 400 이 난다:
    //   Unknown name "$schema" / Unknown name "additionalProperties"
    const s = zodToGeminiSchema(z.object({ a: z.string() })) as Obj
    expect(s.$schema).toBeUndefined()
    expect(s.additionalProperties).toBeUndefined()
  })

  it('enum 을 보존한다', () => {
    const s = zodToGeminiSchema(z.object({ g: z.enum(['A', 'B']) })) as Obj
    expect(s.properties.g.enum).toEqual(['A', 'B'])
  })

  it('숫자 제약(minimum/maximum)을 떼어낸다', () => {
    const s = zodToGeminiSchema(z.object({ n: z.number().int().min(1).max(3) })) as Obj
    expect(s.properties.n.type).toBe('integer')
    expect(s.properties.n.minimum).toBeUndefined()
    expect(s.properties.n.maximum).toBeUndefined()
  })

  it('nullable 을 type 배열에서 플래그로 옮긴다', () => {
    // Gemini 는 type: ["string","null"] 을 모른다
    const s = zodToGeminiSchema(z.object({ x: z.string().nullable() })) as Obj
    expect(Array.isArray(s.properties.x.type)).toBe(false)
    expect(s.properties.x.nullable).toBe(true)
  })

  it('배열의 items 를 보존한다', () => {
    const s = zodToGeminiSchema(z.object({ a: z.array(z.string()) })) as Obj
    expect(s.properties.a.type).toBe('array')
    expect(s.properties.a.items.type).toBe('string')
  })

  it('required 를 보존한다', () => {
    const s = zodToGeminiSchema(
      z.object({ a: z.string(), b: z.string().optional() }),
    ) as Obj
    expect(s.required).toContain('a')
    expect(s.required).not.toContain('b')
  })

  it('실제 CafeAttributes 스키마를 변환한다', () => {
    const LlmAttrs = CafeAttributesSchema.omit({ extractedAt: true, modelVersion: true })
    const s = zodToGeminiSchema(LlmAttrs) as Obj
    expect(s.type).toBe('object')
    expect(Object.keys(s.properties).length).toBe(19)
    // nullable enum 이 올바르게 변환된다 (실측으로 Gemini 가 수락 확인)
    expect(s.properties.scale).toEqual({
      type: 'string', enum: ['대형', '중형', '소형'], nullable: true,
    })
    // evidence 는 필수 (스펙 Layer 3)
    expect(s.required).toContain('evidence')
    expect(JSON.stringify(s)).not.toContain('$schema')
  })
})
