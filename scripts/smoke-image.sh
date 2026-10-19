#!/usr/bin/env bash
# Smoke-test a built image: boots it on a throwaway volume and checks API, SPA, and migrations.
# Usage: scripts/smoke-image.sh <image> [expected-version]   (used by `make image` and CI)
set -euo pipefail
image=${1:?usage: smoke-image.sh <image> [expected-version]}
expected=${2:-}
port=${SMOKE_PORT:-18080}
name="tobox-smoke-$$"

cleanup() { docker rm -f "$name" >/dev/null 2>&1 || true; }
trap cleanup EXIT

docker run -d --name "$name" -p "127.0.0.1:$port:8000" "$image" >/dev/null
base="http://127.0.0.1:$port"

for _ in $(seq 60); do
  curl -fsS "$base/api/health" >/dev/null 2>&1 && break
  sleep 0.5
done || true
health=$(curl -fsS "$base/api/health") || { docker logs "$name"; echo "FAIL: API never became healthy"; exit 1; }
echo "health: $health"

fail() { echo "FAIL: $*"; docker logs "$name"; exit 1; }
[[ -z "$expected" || "$health" == *"\"version\":\"$expected\""* ]] || fail "expected version $expected"
curl -fsS "$base/plan" | grep -q 'id="root"' || fail "SPA shell not served for client route"
asset=$(curl -fsS "$base/" | grep -oE '/assets/[^"]+\.js' | head -1)
[[ -n "$asset" ]] || fail "no JS asset referenced by index.html"
curl -fsSI "$base$asset" | grep -qi 'cache-control: .*immutable' || fail "asset not cacheable"
[[ $(curl -s -o /dev/null -w '%{http_code}' "$base/api/nope") == 404 ]] || fail "unknown API path not 404"
code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$base/api/initiatives" \
  -H 'content-type: application/json' -H 'x-requested-with: tobox' \
  -d '{"title":"Smoke","quadrant":2}')
[[ $code == 201 ]] || fail "could not write to the database (HTTP $code)"
echo "OK: $image"
