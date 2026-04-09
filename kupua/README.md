# Kupua (kjˈuː.pju.ːə)

**Modern frontend WIP PROPOSAL for [Grid](https://github.com/guardian/grid)** – the Guardian's image DAM. Or just a plaything, really.

Kupua  is a React-based replacement for kahuna (AngularJS). It lives inside the Grid monorepo and connects directly to Elasticsearch – either a local instance with sample data, or real Guardian ES clusters via SSH tunnel.

Kupua is also a supernatural shape-shifting being from Hawaiian mythology, usually of cruel and vindictive character, ready to destroy and devour any persons they can catch, oftentimes of kindly spirit giving watchful care to others. One time a man, a vegtable, an animal or a mineral form.

Kupua is also written entirely using Claude Opus 4.6 shamelessly reusing work of every human who worked on Grid over the years, including those who forked it. And everyone else who ever used the internet.

## Quick Start

### Local mode (sample data)

```bash
./kupua/scripts/start.sh
```

Starts a local ES on port 9220, loads 10k sample images, and opens at **http://localhost:3000**.

### TEST mode (real data)

```bash
./kupua/scripts/start.sh --use-TEST
```

Connects to the Guardian's TEST Elasticsearch cluster via SSH tunnel. Requires:

- **AWS CLI v2** – `brew install awscli`
- **Session Manager Plugin** – `brew install session-manager-plugin`
- **Janus credentials** – you need the `media-service` AWS profile. Fetch credentials from [Janus](https://janus.gutools.co.uk) before running.
- **`ssm`** _(optional)_ – [ssm-scala](https://github.com/guardian/ssm-scala) is used if available, otherwise the script falls back to raw AWS CLI. Guardian devs likely have it already.

TEST mode automatically:
1. Establishes an SSH tunnel to TEST ES (port 9200)
2. Discovers the live index alias
3. Starts an **S3 thumbnail proxy** (port 3001) – proxies thumbnail requests using your AWS credentials
4. Starts **imgproxy** (port 3002) – resizes full-size originals from S3 on the fly
5. Enables **write protection** – only read operations (`_search`, `_count`, `_cat/aliases`) are allowed against the real cluster
6. Starts the Vite dev server on port 3000

All image access is read-only and uses your existing developer AWS credentials. See `exploration/docs/infra-safeguards.md` for the full safety framework.

### Options

```bash
./kupua/scripts/start.sh --use-TEST      # Runs in (some) TEST data
./kupua/scripts/start.sh --skip-es       # Skip starting Elasticsearch
./kupua/scripts/start.sh --skip-data     # Skip sample data check
./kupua/scripts/start.sh --skip-install  # Skip npm install check
```

## Prerequisites

### Local mode (everyone)

- **Docker** (with Compose) – `brew install --cask docker` or [Docker Desktop](https://www.docker.com/products/docker-desktop/). Both Compose v2 (`docker compose`) and v1 (`docker-compose`) are supported.
- **Node.js** `^20.19.0` or `≥22.12.0` – `brew install node` or use `nvm use` (`.nvmrc` provided)
- **Python 3** – used by the sample data loader. macOS includes it; check with `python3 --version`
- **Sample data** – `kupua/exploration/mock/sample-data.ndjson` (115MB, not in git). Ask a team member or check S3.

> **First run?** The ES Docker image is ~1.3GB — first `docker compose up` may take a few minutes to download.

### TEST mode (adds)

- **AWS CLI v2** – `brew install awscli`
- **Session Manager Plugin** – `brew install session-manager-plugin`
- **Janus credentials** – `media-service` AWS profile
- **`ssm-scala`** _(optional)_ – used if available, otherwise falls back to raw AWS CLI

### Quick dependency check

```bash
node -v                         # ^20.19.0 || >=22.12.0
docker compose version          # v2.x
python3 --version               # 3.x
aws --version                   # (TEST mode only)
session-manager-plugin          # (TEST mode only — prints version)
```

## Manual Setup (if you prefer)

```bash
# 1. Start Elasticsearch
cd kupua && docker compose up -d

# 2. Load sample data
./kupua/scripts/load-sample-data.sh

# 3. Install dependencies
cd kupua && npm install

# 4. Start dev server
cd kupua && npm run dev
```

## Stopping

```bash
# Stop the dev server: Ctrl+C
# (In TEST mode, this also stops the S3 proxy)

# Stop Elasticsearch / imgproxy
cd kupua && docker compose down

# Stop ES and remove data volume (full reset)
cd kupua && docker compose down -v
```

## Project Structure

```
kupua/
  scripts/
    start.sh                   # One-command startup (local or --use-TEST)
    load-sample-data.sh        # Index creation + bulk data load
    s3-proxy.mjs               # Local S3 thumbnail proxy (TEST mode)
  docker-compose.yml           # ES on port 9220 + imgproxy (port 3002)
  src/
    main.tsx                   # React entry point
    router.ts                  # TanStack Router with custom URL serialisation
    index.css                  # Tailwind CSS + Grid colour theme + Open Sans
    routes/                    # /search, /images/:id (redirect), / (redirect)
    components/                # SearchBar, ImageTable, ImageDetail, DateFilter, etc.
    dal/                       # Data Access Layer (ElasticsearchDataSource)
    stores/                    # Zustand stores (search, columns)
    hooks/                     # URL↔store sync, fullscreen API
    lib/                       # CQL parser, grid config, typeahead, image URLs
    types/                     # TypeScript types from ES mapping
  exploration/
    mock/                      # Sample data, ES mapping, mock Grid config
    docs/                      # Migration plan, deviations log, safeguards
  public/
    fonts/                     # Self-hosted Open Sans (from kahuna)
    images/                    # Grid logo, favicon
  AGENTS.md                    # Agent context (read by Copilot)
```

## Isolation from Grid

Kupua is fully isolated from the main Grid application:

- **Separate Elasticsearch** – port 9220 (Grid uses 9200), separate Docker container (`kupua-elasticsearch`), separate data volume (`kupua-es-data`)
- **No writes to real clusters** – TEST mode enforces read-only access at the adapter level
- **Independent start** – `start.sh` does not interfere with Grid's `dev/script/start.sh`
- **Separate npm** – own `package.json`, own `node_modules`

## Key Documentation

- **[AGENTS.md](AGENTS.md)** – agent context with current state, decisions, and "What's Done" / "What's Next"
- **[Migration Plan](exploration/docs/migration-plan.md)** – phased roadmap, kahuna feature inventory, architecture
- **[Frontend Philosophy](exploration/docs/00%20Architecture%20and%20philosophy/01-frontend-philosophy.md)** – UX/UI philosophy: density continuum, interaction patterns, comparison with Lightroom/Photos/Finder
- **[Deviations](exploration/docs/deviations.md)** – intentional differences from Grid/kahuna
- **[Safeguards](exploration/docs/infra-safeguards.md)** – Elasticsearch & S3 safety documentation

## Current Status

**Phase 2 – Live Elasticsearch (Read-Only)**

Connected to real ES clusters via SSH tunnel. Table view with CQL search, date filters, sort, column resize/visibility, click-to-search, image detail overlay with fullscreen and prev/next navigation. See [AGENTS.md](AGENTS.md) for details.
