# AGENTS.md

## Project Overview

LandSearch — SaaS platform for searching/selling land plots in Russia. FastAPI backend + Next.js frontend with PostGIS for spatial data.

## Architecture

- **Backend**: Python 3.11+ / FastAPI / SQLAlchemy async / GeoAlchemy2 / Alembic
- **Frontend**: Next.js 15 (App Router) / MapLibre GL JS / Tailwind CSS v4
- **Database**: PostgreSQL 16 + PostGIS
- **Cache/Queue**: Redis 7
- **Storage**: Minio (S3-compatible)
- **Integrations**: NSPD (pynspd), Rosreestr cadastre API

Multi-tenant: all data scoped by `tenant_id`. JWT auth via `python-jose`.

## Dev Commands

### Backend (`/backend`)

```bash
# Install (editable mode)
pip install -e ".[dev]"

# Run dev server
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# Run with Docker
docker compose up backend

# Init DB tables
python init_db.py

# Migrations (Alembic, async)
alembic upgrade head
alembic revision --autogenerate -m "description"
```

### Frontend (`/frontend`)

```bash
# Install
npm install

# Dev server
npm run dev

# Build (production, requires NEXT_PUBLIC_API_URL)
NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1 npm run build

# Docker build
docker compose up frontend
```

### Full Stack

```bash
docker compose up          # all services
docker compose up db       # just PostGIS
```

## Important Gotchas

- **Backend env prefix**: All env vars use `LANDSEARCH_` prefix (e.g. `LANDSEARCH_DATABASE_URL`). Config loaded from `backend/.env` via pydantic-settings.
- **DB URL driver**: Must be `postgresql+asyncpg://` (not `postgresql://`). SQLAlchemy async engine requires asyncpg driver.
- **Frontend API URL**: `NEXT_PUBLIC_API_URL` is embedded at **build time**, not runtime. Rebuild to change it.
- **Deploy script**: `scripts/deploy.sh` backs up old `.next/static/chunks` before building, then merges them back for cached browsers. Uses `systemctl restart landsearch-frontend`.
- **Alembic async**: Migrations use `asyncio.run()` internally — run from backend directory.
- **GeoAlchemy2**: Spatial columns use `Geometry("POLYGON", srid=4326)`. Query geometry via `shapely.wkb` and `geoalchemy2.shape`.
- **pynspd optional**: Cadastre enrichment is disabled if `pynspd` is not installed (graceful fallback).
- **CORS**: Configured in `backend/.env` via `LANDSEARCH_CORS_ORIGINS` (comma-separated).

## Code Conventions

- Backend models in `app/models/__init__.py` (single file, not per-model).
- Schemas in `app/schemas/__init__.py`.
- API routes in `app/api/v1/` — each resource is a separate file with `APIRouter`.
- Auth dependency: `get_current_user` (JWT Bearer), `require_role` (role-based access).
- Frontend uses `@/*` path alias (mapped to project root in tsconfig).
- All UI text is in Russian (lang="ru" in HTML).

## Testing

No test files exist yet. Dev dependencies include `pytest` and `pytest-asyncio`.

## Deployment

- Production server: `195.2.74.197`
- DB backup: `scripts/backup-db.sh` (daily cron, 30-day retention)
- Frontend runs as systemd service (`landsearch-frontend`)
- Backend runs as systemd service (`landsearch-backend`)

## Key Files

- `PLAN.md` — full architecture spec, DB schema, API endpoints
- `docker-compose.yml` — all infrastructure services
- `backend/app/main.py` — FastAPI app entry point
- `frontend/lib/api.ts` — typed API client
