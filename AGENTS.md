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

### Backend
- **env prefix**: All env vars use `LANDSEARCH_` prefix (e.g. `LANDSEARCH_DATABASE_URL`). Config loaded from `backend/.env` via pydantic-settings.
- **DB URL driver**: Must be `postgresql+asyncpg://` (not `postgresql://`). SQLAlchemy async engine requires asyncpg driver.
- **Alembic async**: Migrations use `asyncio.run()` internally — run from backend directory.
- **GeoAlchemy2**: Spatial columns use `Geometry("POLYGON", srid=4326)`. Query geometry via `shapely.wkb` and `geoalchemy2.shape`.
- **pynspd optional**: Cadastre enrichment is disabled if `pynspd` is not installed (graceful fallback).
- **CORS**: Configured in `backend/.env` via `LANDSEARCH_CORS_ORIGINS` (comma-separated).

### Frontend
- **NODE_ENV for build**: Must be `NODE_ENV=production` during `next build` (Next.js 15.5.19 bug with pages router error handling).
- **Frontend API URL**: `NEXT_PUBLIC_API_URL` is embedded at **build time**, not runtime. Rebuild to change it.
- **Safari localStorage**: Safari in private mode throws on `localStorage.setItem`. Always use try/catch wrappers (`lib/storage.ts`).
- **CSP**: MapLibre GL JS uses Web Workers via blob URLs. CSP must include `worker-src 'self' blob:; img-src blob:`.

### MapLibre GL JS (CRITICAL)
- **Container height bug**: NEVER put `absolute inset-0` directly on the div passed to `new maplibregl.Map({ container })`. MapLibre adds `.maplibregl-map` class which sets `position: relative`, overriding absolute and causing height=0. Fix: use a wrapper — outer div gets `absolute inset-0`, inner div (the MapLibre container) gets `w-full h-full`.
- **Layer switching**: `map.setStyle(styleObject)` with a style OBJECT fires `style.load` synchronously — before `map.once('style.load', ...)` can register. Layers added in that callback are lost. Fix: use BOTH `map.once('style.load', reinit)` AND `setTimeout(reinit, 500)` with an idempotent guard flag to ensure reinit runs exactly once.
- **Plot polygons on every layer**: After `setStyle()`, all sources and layers are removed. Must re-add plot source + layers and call `source.setData()` in the style.load handler.

### Deployment
- **Standalone mode**: Frontend runs via `node .next/standalone/server.js` (systemd), NOT `next start`. Static files must be manually copied to standalone dir after each build: `cp -r .next/static .next/standalone/.next/static && cp .next/BUILD_ID .next/standalone/.next/BUILD_ID`.
- **nginx**: Proxies `/api/v1/*` → backend (port 8000), all other paths → frontend (port 3000). Static assets have 1-year cache.
- **Seed script**: Always include geometry (PostGIS polygons) for demo plots — the `/plots/geo` endpoint filters `Plot.geometry.isnot(None)`, so plots without geometry are invisible on the map. Re-run `python3 ../scripts/seed.py` from `backend/` after model changes.

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

## Lessons Learned

### Debugging methodology for MapLibre issues
1. **Never trust the HTML** — the SSR output shows correct classes but computed styles may differ. Always use `getComputedStyle()` via Playwright/headless browser.
2. **Check the full layout chain** — map height issues are almost always CSS inheritance problems. Trace from root → main → map container → canvas.
3. **Verify layer switching separately** — `setStyle()` resets everything. Test each base layer independently.
4. **Use Playwright for visual debugging** — screenshots + console logs catch issues that curl/headers cannot.

### Common pitfalls with third-party JS libraries
- Libraries may modify DOM/classes/styles on their containers — always wrap, don't style directly
- Async events may fire synchronously with certain APIs — use both event listeners AND timeouts as fallback
- SSR prerenders HTML but client-side libraries need hydration — test with real browser, not just curl
