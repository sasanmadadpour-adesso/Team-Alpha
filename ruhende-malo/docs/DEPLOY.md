# Deploy: Docker image, Docker Hub, NAS, Cloudflare

One container serves the UI and the API on port **4004**. All data is simulated and lives in a SQLite file on a volume (`/data`). Nothing connects to SAP.

## 1. Build and push (on your computer)

```bash
docker login                                   # your Docker Hub account
scripts/docker-publish.sh <dockerhub-user>      # builds linux/amd64 + linux/arm64 and pushes <user>/ruhend:latest
scripts/docker-publish.sh <dockerhub-user> 1.0  # optional: also tag a version
```

The script builds for both common NAS CPUs (Intel/AMD and ARM). A single-arch local test: `docker build -t ruhend:test .`

> The image contains the source workbook `Datensatz_Deutsch.xlsx` (needed to create the baseline). Use a **private** Docker Hub repository if the data should not be public.

## 2. Run on the NAS

Copy `docker-compose.yml` and `.env.example` to a folder on the NAS (Synology: *Container Manager → Project*; or SSH):

```bash
cp .env.example .env      # set DOCKERHUB_USER, RUHEND_ACCESS_CODE, RUHEND_SESSION_SECRET
docker compose up -d
docker compose logs -f ruhend
```

- First start creates the database from the workbook. A new image with a changed schema recreates it (simulation data only).
- Data survives updates: `docker compose pull && docker compose up -d`.
- Reset the demo any time from the user menu (*Demo-Umgebung → Demo zurücksetzen*), or delete the volume.
- Health: `curl http://<nas>:4004/api/v1/health()` returns `{"mode":"SIMULATION","sapConnection":"NOT_CONFIGURED",…}`.

## 3. Cloudflare in front

Recommended: **Cloudflare Tunnel** (no open port on your router).

1. Cloudflare Zero Trust → *Networks → Tunnels → Create* → run the `cloudflared` connector on the NAS.
2. Public hostname `ruhend.your-domain.com` → service `http://localhost:4004` (or `http://ruhend:4004` if `cloudflared` runs in the same compose network).
3. Optional but strongly advised for a public demo: add a **Cloudflare Access** policy (email one-time PIN) for the hostname.

With a classic reverse proxy instead (Nginx Proxy Manager, Traefik): proxy `https://ruhend.your-domain.com` → `http://<nas>:4004`. Set SSL mode to *Full*.

## 4. Security notes for a public URL

- **Set `RUHEND_ACCESS_CODE`.** Without it anyone who reaches the page can sign in as the maintainer and reset or import data. With it, signing in needs the code; 8 wrong tries per 5 minutes per address are blocked (429). The container warns at start if it is missing.
- **Set `RUHEND_SESSION_SECRET`** (`openssl rand -hex 32`) so sessions survive restarts; without it a random secret is used.
- Reading the data needs no sign-in (it is simulation data). Every write needs a signed-in maintainer or an API key.
- The login is a demo gate, not real authentication. Put Cloudflare Access in front if the URL is shared widely.
- Security headers (CSP, `X-Frame-Options`, `nosniff`) are sent for the page. The app trusts the proxy's `X-Forwarded-For` for the client address.

## Environment variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `RUHEND_ACCESS_CODE` | none | Required sign-in code for the public demo |
| `RUHEND_SESSION_SECRET` | random | Signs session tokens |
| `RUHEND_PUBLIC_URL` | page address | Address shown in the API page and curl examples, e.g. `https://ruhend.your-domain.com` |
| `PORT` | `4004` | Port inside the container |
| `DB_FILE` | `/data/db.sqlite` | SQLite file (on the volume) |
