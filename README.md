# EUPayGrid

Production-style MVP for a permissioned institutional settlement network simulation in Europe.

EUPayGrid includes:

- permissioned institution onboarding
- reserve-backed internal balance activation (simulated)
- institutional transfer settlement with double-entry ledger
- governance controls (approve/suspend/freeze/unfreeze) with audit log
- privacy-aware network activity views
- realtime operational updates in UI via WebSocket

## Stack

- Backend: FastAPI + asyncpg + Postgres
- Frontend: Next.js App Router + TypeScript + Tailwind + Recharts
- Infra: Docker Compose

## GitHub Üzerinden Çalıştırılabilir Demo

[![Open in GitHub Codespaces](https://github.com/codespaces/badge.svg)](https://codespaces.new/WeAreTheArtMakers/eupaygrid)

Repository sayfasından Codespaces ile doğrudan çalıştırabilirsiniz:

```bash
./scripts/start-demo.sh
```

Portlar:

- Frontend: `3000`
- Backend: `8000`
- Postgres: `5432`

## Repository structure

- `backend/` FastAPI app
- `frontend/` Next.js app
- `infra/` local infra scaffolding
- `docs/architecture.md` architecture and design notes
- `docs/isp-tr.md` Kurumsal Mutabakat Protokolü (ISP) ürün metni (TR)
- `scripts/demo_seed.sh` helper for demo data
- `scripts/start-demo.sh` one-command demo startup
- `proto/` future event schema placeholder

## Quick start (Docker)

```bash
cp .env.example .env
docker compose up --build
```

Endpoints:

- Frontend: http://localhost:3000
- Backend: http://localhost:8000
- Backend metrics: http://localhost:8000/metrics
- Postgres: localhost:5432

## Local development (without Docker)

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

## Core API endpoints

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

## Suggested demo flow

1. Open `http://localhost:3000` and click **Demo Mode Seed**.
2. Go to `/institutions` and inspect created institutions.
3. Approve/suspend/freeze/unfreeze an institution and verify behavior.
4. Go to `/transfers`:
   - record a reserve deposit
   - submit a transfer between approved institutions
5. Verify:
   - status updates and settlement tx id
   - ledger entries on `/ledger`
   - balance changes on `/balances`
   - privacy view on `/network`
   - governance actions on `/admin`

## Business rule checks

- Only approved institutions can send/receive.
- Suspended institutions cannot transact.
- Frozen wallets cannot initiate outgoing transfers.
- Insufficient balance fails transfer.
- Successful transfer writes transfer + settlement + 2 ledger entries + balance updates.
- Admin actions are audit logged.

## Notes

- Settlement layer is simulated (`simulated-solana`) with generated mock tx ids.
- OTel collector is scaffolded under compose profile `observability`.
