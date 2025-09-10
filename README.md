# Loki Launcher

AI-powered social media automation scaffold.

## What’s here
- `apps/web` — Next.js placeholder UI
- `services/api` — FastAPI backend placeholder
- `services/worker` — background jobs placeholder
- `packages/shared` — shared utils/types
- `.github/workflows/ci.yml` — basic CI for Node and Python

## Quickstart (local dev)
### Requirements
- Node 20+
- Python 3.11+
- uv or pip + venv
- pnpm or npm

### Frontend
```bash
cd apps/web
npm install
npm run dev
# then open http://localhost:3000
```

### API
```bash
cd services/api
python -m venv .venv && source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8080
# then open http://localhost:8080/docs
```

### Worker (stub)
```bash
cd services/worker
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python worker.py
```

## GitHub setup
1. Create a repo (private).
2. Upload this zip’s contents (drag-and-drop in GitHub web UI), or push via git:
```bash
git init
git remote add origin https://github.com/<USERNAME>/<REPO>.git
git add .
git commit -m "chore: bootstrap Loki Launcher scaffold"
git branch -M main
git push -u origin main
```
3. Configure Actions permissions if CI is blocked (Repo → Settings → Actions).

## Notes
This is a scaffold only. No third‑party API calls are implemented yet.
