import { z } from 'zod'

const EnvSchema = z
  .object({
    // 수집: 장소 검색과 블로그 검색을 이 키 하나로 한다 (스펙 v3 6.3)
    KAKAO_REST_API_KEY: z.string().min(1),

    // LLM: provider-agnostic. .env 두 줄로 갈아탄다 (스펙 6.6 원칙 3)
    LLM_PROVIDER: z.enum(['gemini', 'anthropic']).default('gemini'),
    GEMINI_API_KEY: z.string().min(1).optional(),
    ANTHROPIC_API_KEY: z.string().min(1).optional(),

    // 저장: DB 없음. JSON in git (스펙 v3 9절)
    DATA_DIR: z.string().min(1).default('data'),

    // 출발지: 인천 부평구 수변로 334 (pipeline/geo.ts 의 HOME 과 같은 값)
    HOME_LAT: z.coerce.number().default(37.5151091),
    HOME_LNG: z.coerce.number().default(126.7398273),
  })
  .superRefine((v, ctx) => {
    // 고른 provider 의 키만 요구한다. 둘 다 강제하면 무료 경로를 쓰는
    // 사람이 쓰지도 않는 Anthropic 키를 발급해야 한다.
    if (v.LLM_PROVIDER === 'gemini' && !v.GEMINI_API_KEY) {
      ctx.addIssue({
        code: 'custom',
        path: ['GEMINI_API_KEY'],
        message: 'LLM_PROVIDER=gemini 이면 필요하다',
      })
    }
    if (v.LLM_PROVIDER === 'anthropic' && !v.ANTHROPIC_API_KEY) {
      ctx.addIssue({
        code: 'custom',
        path: ['ANTHROPIC_API_KEY'],
        message: 'LLM_PROVIDER=anthropic 이면 필요하다',
      })
    }
  })

export type Env = z.infer<typeof EnvSchema>

export function loadEnv(
  source: Record<string, string | undefined> = process.env,
): Env {
  // 빈 문자열은 "미설정"으로 취급한다. .env 에 KEY= 만 남은 흔한 실수를
  // zod 의 min(1) 이 잡도록 undefined 로 바꿔 넘긴다.
  const cleaned: Record<string, string | undefined> = {}
  for (const [k, v] of Object.entries(source)) {
    cleaned[k] = v === '' ? undefined : v
  }

  const parsed = EnvSchema.safeParse(cleaned)
  if (!parsed.success) {
    const keys = [...new Set(parsed.error.issues.map((i) => i.path.join('.')))].join(', ')
    throw new Error(`환경변수 오류 — 확인 필요: ${keys}`)
  }
  return parsed.data
}
