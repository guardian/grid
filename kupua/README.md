# Kupua

**Modern frontend for [Grid](https://github.com/guardian/grid)** — the Guardian's image DAM.

Kupua is a React-based replacement for kahuna (AngularJS). It lives inside the Grid monorepo and currently runs against a local Elasticsearch instance loaded with sample data.

## Quick Start

```bash
# From the repo root — does everything: starts ES, loads data, installs deps, starts dev server
./kupua/scripts/start.sh
```

Opens at **http://localhost:3000**.

### What `start.sh` does

1. Starts kupua's **local Elasticsearch** via Docker Compose (port **9220** — won't clash with Grid's ES on 9200)
2. Waits for ES to be healthy
3. Loads **sample data** into ES if the index is empty (10k docs from CODE)
4. Runs `npm install` if dependencies are missing or stale
5. Starts the **Vite dev server** on port 3000

### Options

```bash
./kupua/scripts/start.sh --skip-es       # Skip starting Elasticsearch
./kupua/scripts/start.sh --skip-data     # Skip sample data check
./kupua/scripts/start.sh --skip-install  # Skip npm install check
```

## Prerequisites

- **Docker** — for local Elasticsearch
- **Node.js ≥ 18** — for the Vite dev server
- **Sample data** — `kupua/exploration/mock/sample-data.ndjson` (115MB, not in git). Download from S3:
  ```bash
  aws s3 cp s3://<sample-data-backup-bucket>/sample-data.ndjson kupua/exploration/mock/sample-data.ndjson
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

# Stop Elasticsearch
cd kupua && docker compose down

# Stop ES and remove data volume (full reset)
cd kupua && docker compose down -v
```

## Project Structure

```
kupua/
  scripts/
    start.sh                   # One-command startup
    load-sample-data.sh        # Index creation + bulk data load
  docker-compose.yml           # Standalone ES on port 9220
  src/
    main.tsx                   # React entry point
    router.ts                  # TanStack Router with custom URL serialisation
    routes/                    # File-based routes
    components/                # UI components (SearchBar, ImageTable, etc.)
    dal/                       # Data Access Layer (ES adapter now, Grid API later)
    stores/                    # Zustand stores (search, columns)
    hooks/                     # URL↔store sync hooks
    lib/                       # CQL parser, config, typeahead fields
    types/                     # TypeScript types from ES mapping
  exploration/
    mock/                      # Sample data, mapping, mock config
    docs/                      # Migration plan, deviations log
  public/
    fonts/                     # Self-hosted Open Sans (from kahuna)
    images/                    # Grid logo, favicon
  AGENTS.md                    # Agent context (read by Copilot)
```

## Key Documentation

- **[Migration Plan](exploration/docs/migration-plan.md)** — phased roadmap, kahuna feature inventory, architecture
- **[Deviations](exploration/docs/deviations.md)** — intentional differences from Grid/kahuna
- **[AGENTS.md](AGENTS.md)** — agent context with current state and decisions

## Isolation from Grid

Kupua is fully isolated from the main Grid application:

- **Separate Elasticsearch** — port 9220 (Grid uses 9200), separate Docker container (`kupua-elasticsearch`), separate data volume (`kupua-es-data`)
- **No production calls** — Phase 1 is entirely local. No connection to CODE/PROD systems
- **Independent start** — `start.sh` does not interfere with Grid's `dev/script/start.sh`
- **Separate npm** — own `package.json`, own `node_modules`

## Current Status

**Phase 1 — Read-Only with Sample Data** (in progress)

See [AGENTS.md](AGENTS.md) for detailed "What's Done" and "What's Next" lists.

