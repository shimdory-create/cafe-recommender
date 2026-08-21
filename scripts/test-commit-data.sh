#!/usr/bin/env bash
# scripts/commit-data.sh 를 실제 충돌 시나리오로 시험한다.
#
#   bash scripts/test-commit-data.sh "$PWD/scripts/commit-data.sh" /tmp/ct
#
# 가짜 원격과 가짜 npm 으로 돌기 때문에 실제 저장소를 건드리지 않는다.
# vitest 로 돌리지 않는 이유: 검증 대상이 git 동작이라 셸이 더 정확하다.
#
# 시나리오: 잡이 오래 돌고 있는 사이에 다른 잡이 원격에 push 했고,
# 그 push 가 data/ 와 생성물을 **둘 다** 고쳤다. (실제 실패 상황)
set -uo pipefail

SRC="$1"          # 시험할 스크립트 경로 (절대)
ROOT="$2"         # 작업 디렉터리
rm -rf "$ROOT"; mkdir -p "$ROOT"; cd "$ROOT"

# 가짜 npm: `npm run --silent site` 이 오면 data 를 합쳐 생성물을 다시 만든다
mkdir -p bin
cat > bin/npm <<'EOF'
#!/usr/bin/env bash
if [ "${1:-}" = "run" ]; then
  mkdir -p web/src/generated
  { echo "generated-from:"; cat data/*.json; } > web/src/generated/site.json
  exit 0
fi
exit 0
EOF
chmod +x bin/npm
export PATH="$ROOT/bin:$PATH"

git init -q --bare origin.git

git clone -q origin.git jobA
cd jobA
git config user.email a@x; git config user.name a
mkdir -p data web/src/generated
echo '{"a":1}' > data/cafes.json
echo 'seed' > web/src/generated/site.json
git add -A; git commit -q -m seed; git branch -M master; git push -q origin master
cd ..

git clone -q origin.git jobB

# --- 다른 잡(B)이 먼저 원격을 고친다: data 와 생성물 둘 다 ---
cd jobB
git config user.email b@x; git config user.name b
echo '{"b":2}' > data/buzz.json
echo 'B 가 만든 생성물' > web/src/generated/site.json
git add -A; git commit -q -m "data: 다른 잡"; git push -q origin master
cd ..

# --- 우리 잡(A)이 오래 돌다가 이제 커밋한다 ---
cd jobA
echo '{"a":1,"new":true}' > data/cafes.json
echo 'A 가 만든 생성물' > web/src/generated/site.json   # 충돌 유발 지점

bash "$SRC" "시험"
RC=$?
echo "--- 결과 (exit $RC) ---"
git log --oneline origin/master -3 2>/dev/null || git log --oneline -3
echo "--- 원격 site.json ---"
git fetch -q origin master
git show origin/master:web/src/generated/site.json
echo "--- 원격 data ---"
git show origin/master:data/cafes.json
git show origin/master:data/buzz.json
exit $RC
