#!/usr/bin/env bash
#
# 잡이 만든 데이터를 커밋·푸시한다. 다섯 워크플로가 공유한다.
#
# 왜 스크립트로 뺐는가 — 이 일이 두 번 깨졌고, 깨진 곳이 다섯 군데였다.
#
#   1차: `git pull --rebase` 를 커밋 **전에** 불러서
#        "cannot pull with rebase: You have unstaged changes" 로 전부 실패.
#   2차: 38분 걸리는 발굴 잡이 끝날 때쯤 다른 잡이 site.json 을 밀어놔서
#        "CONFLICT (content): web/src/generated/site.json" 로 실패.
#
# 2차의 교훈이 이 스크립트의 규칙이다:
#
#   **생성물은 병합하지 않는다. 다시 만든다.**
#
# `web/src/generated/site.json` 은 data/ 에서 계산되는 파생물이다. 양쪽이
# 고쳤을 때 "합치는" 것은 의미가 없고 위험하다 — 합쳐진 JSON 은 어느 쪽
# 데이터와도 일치하지 않는다. 그래서 원격 것을 받고, 데이터를 정렬한 뒤,
# 마지막에 **다시 생성**한다.
#
# 반대로 data/ 충돌은 사람이 봐야 한다. 그건 두 잡이 같은 파일을 동시에
# 고쳤다는 뜻이고, concurrency group 이 막고 있어야 할 일이 뚫렸다는 신호다.
# 조용히 한쪽을 버리지 않고 실패로 끝낸다.
set -uo pipefail

MSG="${1:?커밋 메시지가 필요하다 (예: 화제량 갱신)}"
GENERATED="web/src/generated"

git config user.name  "cafe-bot"
git config user.email "cafe-bot@users.noreply.github.com"

# 1. 데이터만 커밋한다. 생성물은 아직 넣지 않는다.
git add data/
if git diff --staged --quiet; then
  echo "변경 없음"
  exit 0
fi
git commit -q -m "data: ${MSG} $(date -u +%Y-%m-%d)"

BRANCH="$(git rev-parse --abbrev-ref HEAD)"

for attempt in 1 2 3; do
  git fetch -q origin "$BRANCH" || { echo "fetch 실패"; sleep 5; continue; }

  # 2. 내 생성물을 버리고 원격 것으로 맞춘다 -> 충돌 자체가 생기지 않는다.
  git checkout -q "origin/$BRANCH" -- "$GENERATED" 2>/dev/null || true
  git add "$GENERATED" 2>/dev/null || true
  git diff --staged --quiet || git commit -q --amend --no-edit

  # 3. 데이터를 원격 위로 정렬한다. 여기서 충돌하면 사람이 봐야 한다.
  if ! git rebase -q "origin/$BRANCH"; then
    git rebase --abort >/dev/null 2>&1 || true
    echo "data/ 충돌 — 두 잡이 같은 파일을 동시에 고쳤다. 사람 확인 필요."
    exit 1
  fi

  # 4. 정렬된 데이터로 생성물을 **다시 만든다**.
  if ! npm run --silent site; then
    echo "페이로드 생성 실패"
    exit 1
  fi
  git add "$GENERATED"
  git diff --staged --quiet || git commit -q --amend --no-edit

  if git push -q; then
    echo "푸시 완료 ($(git rev-parse --short HEAD))"
    exit 0
  fi
  echo "재시도 $attempt"
  sleep 5
done

echo "3회 시도 후 푸시 실패"
exit 1
