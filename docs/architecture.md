# EUPayGrid Architecture (MVP)

## Product intent

EUPayGrid is a permissioned institutional settlement simulation for EU-regulated entities.
The MVP models reserve-backed internal balances, transfer settlement, governance controls, and privacy-aware activity views.

## Top-level structure

- `backend/` FastAPI service with domain logic and Postgres persistence
- `frontend/` Next.js App Router UI for operations, governance, and demo views
- `infra/` local infrastructure scaffolding (compose + OTel collector scaffold)
- `docs/` architecture and product notes
- `scripts/` helper scripts (seed/demo extensions)
- `proto/` reserved for future event schema contracts

## Backend architecture

### Layers

- `app/main.py`: app lifecycle, middleware, route registration, websocket endpoint
- `app/api/`: route modules grouped by domain (`institutions`, `transfers`, `ledger`, `admin`, `network`)
- `app/services/settlement.py`: core domain service and transactional logic
- `app/db/schema.sql`: relational schema and constraints
- `app/db/session.py`: asyncpg pool lifecycle and bootstrap schema execution

### Core rules enforced

- Only `approved` institutions can send/receive
- `suspended` institutions cannot transact
- Frozen sender wallet blocks outgoing transfers
- Insufficient sender balance blocks transfer
- Every successful transfer creates:
  - transfer record (`status=settled`)
  - settlement event (`simulated-solana` tx id)
  - two immutable ledger entries (credit sender, debit recipient)
  - balance projection updates
  - outbox event
- Admin/governance actions are persisted in `admin_actions`

### Data model

- `institutions`
- `wallets` (internal and pseudonymous)
- `balances` (projection)
- `reserve_deposits`
- `transfers`
- `ledger_entries` (append-only trigger protected)
- `settlement_events` (append-only trigger protected)
- `admin_actions`
- `outbox_events`
- `processed_events` (scaffold)

## Frontend architecture

### App pages

- `/` overview KPIs, charts, recent activity, demo seed action
- `/institutions` onboarding, approval/suspension, freeze/unfreeze, search
- `/transfers` transfer console + reserve deposit + transfer history
- `/ledger` immutable ledger table + replay control
- `/balances` balance table + top balance chart
- `/network` privacy mode switch (global, institution, admin)
- `/admin` transfer supervision + governance audit log
- `/settings` placeholder for policy config

### Client integration

- `src/lib/api.ts`: typed API client
- `src/lib/ws.ts`: reconnecting websocket hook
- `src/components/ToastProvider.tsx`: action feedback system

## Realtime model

- Backend websocket endpoint: `WS /ws/events`
- UI subscribes for:
  - transfer settled/failed
  - reserve deposits
  - institution governance changes
  - periodic snapshot payload

## Observability scaffold

- Prometheus metrics endpoint (`/metrics`) in backend
- OTel collector profile available in compose (`observability` profile)

## Replayability

- `POST /ledger/replay` truncates and rebuilds `balances` from immutable `ledger_entries`

## Deployment model (MVP)

- Local compose stack:
  - frontend `:3000`
  - backend `:8000`
  - postgres `:5432`
