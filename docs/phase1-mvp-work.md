# Phase 1 MVP Work Notes

## Goal

Build a Docker-first local MVP for a personal tech catch-up tool that can:

- start with `docker compose up -d --build`
- show a mobile-friendly article list UI
- register article URLs manually
- persist data in SQLite
- save reactions and queue Notion-bound actions locally

## Scope For This Phase

- `docker-compose.yml`
- `frontend/Dockerfile`
- `backend/Dockerfile`
- React + Vite frontend
- Node.js + Express backend
- SQLite initialization
- tables:
  - `articles`
  - `summaries`
  - `reactions`
  - `notion_queue`
  - `interest_weights`
- APIs:
  - `GET /api/health`
  - `GET /api/articles`
  - `GET /api/articles/:id`
  - `POST /api/articles`
  - `POST /api/articles/:id/reactions`
- README for Docker-first startup and operations

## Implementation Plan

1. Scaffold backend structure and Dockerfile.
2. Add SQLite schema and initialization logic with seed data for `interest_weights`.
3. Implement article and reaction APIs.
4. Scaffold frontend structure and Dockerfile.
5. Build mobile-first UI for article registration, filtering, and reactions.
6. Wire frontend to backend API.
7. Add root Docker Compose, `.env.example`, `.dockerignore`, and README.
8. Run container-based verification for Phase 1 acceptance criteria.

## Important Decisions

- SQLite file path will be `/app/data/app.db` inside the backend container.
- Host persistence target will be `./backend/data:/app/data`.
- Phase 1 will keep article status simple:
  - `new`
  - `summarized`
  - `failed`
  - `queued`
- Only `try_later` reactions will enqueue a record in `notion_queue`.
- If title is omitted during manual URL registration, the URL itself will be stored as the title.

## Risks / Things To Watch

### 1. Git safe.directory warning on this machine

Current repo access through Git shows a Windows ownership mismatch warning:

- repository path: `C:/Users/rinnr/Documents/GitHub/tech-catchup`
- likely impact: `git status`, `git diff`, and commit-related commands may fail until the repo is added to Git safe directories

Possible fix later:

```powershell
git config --global --add safe.directory C:/Users/rinnr/Documents/GitHub/tech-catchup
```

### 2. Docker Desktop / Compose availability

The requested startup flow depends on:

- Docker Engine being available
- `docker compose` being installed and callable from this Windows environment

If either is missing, implementation can still be prepared, but runtime verification will be blocked.

### 3. SQLite concurrent access model

SQLite is a good fit for this personal MVP, but we should keep access centralized in the backend and avoid frontend direct file access. For later background jobs such as RSS fetch and summarization workers, transaction handling should remain simple and serialized where practical.

### 4. Vite inside Docker on Windows

For stable development from Docker on Windows, the frontend container will likely need:

- `host: 0.0.0.0`
- explicit port exposure
- polling-based file watching if live reload becomes unstable

### 5. Future Cloudflare / Notion / Codex integration

These are intentionally out of scope for Phase 1, but we should leave clean extension points for:

- queue processing
- scheduled jobs
- environment-based credentials
- additional containers such as `cloudflared`

## Open Technical Notes

- RSS fetching is Phase 2, so no feed ingestion is needed yet.
- AI summarization is Phase 3, but schema and status handling should be ready now.
- Notion sync is Phase 4, but queue creation on button click is required now.

## Acceptance Checklist

- `docker compose up -d --build` starts frontend and backend
- frontend is reachable at `http://localhost:5173`
- backend is reachable at `http://localhost:3000`
- `GET /api/health` returns success
- manual URL registration works
- articles persist in SQLite
- article list is visible in the UI
- reactions persist in SQLite
- `try_later` creates `notion_queue` entries
- data survives container restart
