/**
 * `npm run label` 이 보여줄 카드 40장을 그대로 렌더링한다.
 * 입력을 받지 않고 라벨도 저장하지 않는다 (읽기 전용 점검).
 */
import { createJsonStore } from '../src/store/json-store.js'
import { runLabel } from '../src/cli/label.js'

const store = createJsonStore('data')
let cards = 0
const lines: string[] = []

await runLabel(
  {
    store: {
      readCafes: store.readCafes,
      readBuzz: store.readBuzz,
      readVisits: store.readVisits,
      // 기존 라벨을 무시하고 40곳 전체를 렌더링한다
      readGolden: async () => [],
      // 저장하지 않는다
      writeGolden: async () => {},
    },
    ask: async (p) => {
      if (p === '> ') { cards++; return '?' }
      return '?'
    },
    print: (s) => lines.push(s),
  },
  { perStratum: 10 },
)

console.log(lines.join('\n'))
console.log(`\n===== 렌더링된 카드 ${cards}장 =====`)
