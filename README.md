# EUPayGrid

Production-style MVP for a permissioned institutional settlement network simulation in Europe.

EUPayGrid includes:

- permissioned institution onboarding
- reserve-backed internal balance activation (simulated)
- institutional transfer settlement with a double-entry ledger
- governance controls (approve/suspend/freeze/unfreeze) with audit log
- privacy-aware network activity views
- realtime operational updates in the UI via WebSocket

## Live Demo

- Frontend (Vercel): [https://eupaygrid-demo.vercel.app](https://eupaygrid-demo.vercel.app)
- Backend API (Railway): [https://eupaygrid-backend-production.up.railway.app](https://eupaygrid-backend-production.up.railway.app)

## Stack

- Backend: FastAPI + asyncpg + Postgres
- Frontend: Next.js App Router + TypeScript + Tailwind + Recharts
- Infra: Docker Compose

## Run on GitHub (Codespaces)

[![Open in GitHub Codespaces](https://github.com/codespaces/badge.svg)](https://codespaces.new/WeAreTheArtMakers/eupaygrid)

You can run the demo directly from the repository page in Codespaces:

```bash
./scripts/start-demo.sh
```

Ports:

- Frontend: `3000`
- Backend: `8000`
- Postgres: `5432`

## Repository Structure

- `backend/` FastAPI app
- `frontend/` Next.js app
- `infra/` local infrastructure scaffolding
- `docs/architecture.md` architecture and design notes
- `docs/isp-tr.md` ISP product narrative in Turkish
- `polyphony-ledger` reference: [WeAreTheArtMakers/polyphony-ledger](https://github.com/WeAreTheArtMakers/polyphony-ledger)
- `scripts/demo_seed.sh` helper for demo data
- `scripts/start-demo.sh` one-command demo startup
- `proto/` future event schema placeholder

## Quick Start (Docker)

```bash
cp .env.example .env
docker compose up --build
```

Local endpoints:

- Frontend: http://localhost:3000
- Backend: http://localhost:8000
- Backend metrics: http://localhost:8000/metrics
- Postgres: localhost:5432

## Public Deployment (Railway + Vercel)

1. Deploy backend to Railway from the repository root.
2. Configure Railway build source as `backend/Dockerfile`.
3. Add a Postgres service/plugin in Railway.
4. Set backend environment variables: `POSTGRES_DSN` (Railway Postgres `DATABASE_URL`), `CORS_ORIGINS` (your Vercel frontend URL), `ALLOWED_CURRENCIES=EUR`, `SETTLEMENT_LAYER=simulated-solana`.
5. Deploy frontend to Vercel from the `frontend/` directory.
6. Set frontend environment variables in Vercel: `NEXT_PUBLIC_API_BASE=https://<your-backend-domain>`, `NEXT_PUBLIC_WS_URL=wss://<your-backend-domain>/ws/events`, `NEXT_PUBLIC_DEFAULT_ACTOR=ui-operator@eupaygrid.local`.
7. Update the **Live Demo** section at the top of this README with final URLs.

Alternative backend target:

- `render.yaml` is included for Render blueprint-style deployment.

## Local Development (without Docker)

### Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -e .
cd ..
uvicorn backend.app.main:app --host 0.0.0.0 --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

## Core API Endpoints

- `POST /institutions`
- `GET /institutions`
- `PATCH /institutions/{id}/approve`
- `PATCH /institutions/{id}/suspend`
- `PATCH /institutions/{id}/freeze`
- `PATCH /institutions/{id}/unfreeze`
- `POST /reserves/deposit`
- `POST /transfers`
- `GET /transfers`
- `GET /ledger/entries`
- `POST /ledger/replay`
- `GET /balances`
- `GET /network/activity`
- `GET /admin/audit-log`
- `POST /demo/seed`
- `GET /health`
- `WS /ws/events`

## Suggested Demo Flow

1. Open `http://localhost:3000` and click **Demo Mode Seed**.
2. Go to `/institutions` and inspect created institutions.
3. Approve/suspend/freeze/unfreeze an institution and verify behavior.
4. Go to `/transfers`, record a reserve deposit, then submit a transfer between approved institutions.
5. Verify status updates and settlement tx id.
6. Verify ledger entries on `/ledger`.
7. Verify balance changes on `/balances`.
8. Verify privacy view behavior on `/network`.
9. Verify governance actions and audit log on `/admin`.

## Business Rule Checks

- Only approved institutions can send and receive.
- Suspended institutions cannot transact.
- Frozen wallets cannot initiate outgoing transfers.
- Insufficient balance fails transfer.
- A successful transfer writes transfer + settlement + 2 ledger entries + balance updates.
- Admin actions are audit logged.

## Notes

- The settlement layer is simulated (`simulated-solana`) with generated mock tx ids.
- OTel collector scaffolding is available under the compose profile `observability`.

## Known Simulations / Incomplete Areas

- Real Solana on-chain write path (currently placeholder settlement event)
- Real fiat reserve partner integration
- Full authentication and RBAC layer (currently demo actor header)
- Transfer screen recipient UX should evolve from free text to institution picker/search flow

## Next Development Phases

1. Identity, authentication, and RBAC hardening: add SSO/OIDC login, enforce role-based policy checks server-side, and replace demo actor header with signed identity context.
2. Real settlement integration: implement Solana transaction writing and confirmation tracking with retry, idempotency keys, and settlement reconciliation jobs.
3. Fiat rail integration: ingest reserve deposits/withdrawals from a regulated banking partner API and add reserve reconciliation plus exception workflows.
4. Transfer UX and operations tooling: replace free-text recipient entry with institution picker/search and expand admin tooling (filters, exports, case management).
5. Reliability and compliance: expand test coverage (unit + integration + e2e + load) and add full tracing dashboards, alerting, and formal audit evidence exports.

## License

This project is licensed under the **WATAM (WeAreTheArtMakers) License**. See the `LICENSE` file for details.
