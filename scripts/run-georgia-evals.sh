#!/usr/bin/env bash
set -euo pipefail
root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
if [[ ! -x "$root/.venv/bin/python" ]]; then
  echo 'Missing .venv; see README_GEORGIA.md' >&2
  exit 2
fi
cd "$root"
set +e
"$root/.venv/bin/python" -m pytest -q georgia_tests
checks=$?
set -e
if (( checks != 0 )); then
  if (( checks == 1 )); then exit 1; else exit 2; fi
fi
exec "$root/.venv/bin/python" -m georgia.run "$@"
