#!/usr/bin/env bash
set -euo pipefail

curl -sS -X POST http://localhost:8000/demo/seed \
  -H 'x-actor: script-operator@eupaygrid.local' \
  -H 'content-type: application/json'

echo
