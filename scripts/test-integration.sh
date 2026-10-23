#!/usr/bin/env bash
# Runs test/integration against a throwaway PostgreSQL container.
# Never point these tests at a shared database: they create and reset players.
set -euo pipefail

cd "$(dirname "$0")/.."
ENGINE=${CONTAINER_ENGINE:-$(command -v podman || command -v docker)}
PORT=${OT_TEST_DB_PORT:-55432}
NAME="ot-integration-db-$$"

cleanup() { "$ENGINE" rm -f "$NAME" >/dev/null 2>&1 || true; }
trap cleanup EXIT

"$ENGINE" run -d --rm --name "$NAME" \
  -e POSTGRES_USER=ot -e POSTGRES_PASSWORD=ot -e POSTGRES_DB=ot_integration \
  -p "127.0.0.1:${PORT}:5432" docker.io/library/postgres:16-alpine \
  -c fsync=off -c synchronous_commit=off -c full_page_writes=off >/dev/null

for _ in $(seq 1 60); do
  "$ENGINE" exec "$NAME" pg_isready -U ot -d ot_integration >/dev/null 2>&1 && break
  sleep 0.5
done

# Disposable local credentials only; replaces anything the env files define.
export OT_INTEGRATION_DB=1
export POSTGRES_PRISMA_URL="postgresql://ot:ot@127.0.0.1:${PORT}/ot_integration"
export POSTGRES_URL_NON_POOLING="$POSTGRES_PRISMA_URL"
# Combat replays are signed; a fixed test-only key keeps runs reproducible.
export JWT_SECRET=integration-tests-only

bun --no-env-file x prisma migrate deploy --config prisma/integration.config.ts >/dev/null
if [ "$#" -eq 0 ]; then set -- test/integration; fi
bun --no-env-file --config=test/integration/bunfig.toml test --timeout 600000 "$@"
