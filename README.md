# Perix

Social city app. One repo, one frontend, one backend.

## Structure

```
Perix-main/
  frontend/   # Expo (React Native + web) app — the single source of truth
  backend/    # FastAPI + MongoDB backend (deployed on Railway)
  Dockerfile  # serves backend + webdist (built frontend)
  railway.json
```

## Local development

```bash
# Web app
cd Perix-main/frontend
npm install
npm run web            # expo start --web

# Backend
cd Perix-main/backend
pip install -r requirements.txt
uvicorn server:app --reload
```

Checks before committing:

```bash
cd Perix-main/frontend
npm run typecheck      # tsc --noEmit
cd Perix-main/backend
python -m py_compile routes/*.py services/*.py
```

## Deploy (web → Railway, service `backend`)

```powershell
# 1. Build the web bundle
cd Perix-main/frontend
npx expo export --platform web

# 2. Copy the build into the backend web root
robocopy frontend\dist backend\webdist /MIR

# 3. Sync backend to a staging folder (excludes caches/tests)
robocopy backend "$env:TEMP\opencode\rz-deploy\Perix-main\backend" /MIR /XD "__pycache__" ".pytest_cache" "tests" ".git"

# 4. Copy Dockerfile + railway.json next to it
Copy-Item Dockerfile, railway.json "$env:TEMP\opencode\rz-deploy\Perix-main\"

# 5. Deploy from the staging folder
cd "$env:TEMP\opencode\rz-deploy\Perix-main"
railway up --service backend --no-gitignore
```

Notes:

- Always run `railway up` from the staging folder with `--no-gitignore`.
- If the Railway build fails once ("operation timed out"), retry — the second attempt usually succeeds.
- Do NOT add a bare `*.txt` rule to any `.gitignore` — the Railway CLI applies
  gitignore rules to uploads and a bare `*.txt` silently excludes
  `backend/requirements.txt` and breaks every deploy.
- `backend/webdist/` is generated and not tracked in git.

## Admin / moderation

- Admins: emails listed in `backend/routes/admin.py` (`ADMIN_EMAILS`).
- Admin UI: app → Settings → Blocked Users → Reports section (admins only).
- Reporting/blocking/deletion rules: `GET /api/reports/policy?lang=en|de|el`
  (source of truth: `backend/routes/reports.py`).
- No calls: voice/video calling was removed from the app entirely.
