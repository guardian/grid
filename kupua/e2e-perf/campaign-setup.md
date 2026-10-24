# Campaign Setup and Flags

[Operator entry point](README.md). These instructions do not authorize agent-run campaigns or live work.

## Flags

| Flag | Meaning |
| --- | --- |
| `--full` | All maintained suites. Does not run archived experiments. |
| `--suite existing\|justified\|combined` | Choose the suite family; `existing` is the default. |
| `--perceived`, `--perceived-only`, `--short-perceived-only`, `--long-perceived-only` | Choose rendering/responsiveness coverage as shown above. Mutually exclusive. |
| `--runs N` | Repetitions; default 1. Use 4 for baselines. Recorded runs including long journeys require an **even** count; a one-run dry diagnostic is allowed. |
| `--label "..."` | A useful description of the tested change/environment; otherwise “Unnamed run”. A label does not select a workload. |
| `--use-media-api` | Local media-api over the TEST tunnel; requires the matching app mode and authentication. |
| `--use-deployed-media-api` | Deployed TEST media-api; requires the matching app mode and authentication. Cannot combine with the local API flag. |
| `--dry-run` / `--no-log` | Executes tests without appending campaign history. **Still performs reads and writes diagnostic reports.** |
| `--headed` | Explicitly requests a visible browser. Maintained campaign configurations already run headed. |
| Positional scenario-ID list | Advanced filtering, not density selection. Obtain current identifiers from the relevant spec; runner matching is regex-based, not exact-title matching. Not accepted with `--full` or justified-only. |
| `--rebuild-history` | No-browser maintenance: regenerate jank JS/Markdown from canonical JSON. |
| `--prune-history` | Destructive jank-history maintenance using the current replacement manifest. Review before use; not a normal campaign step. |

History-maintenance flags require the existing suite. Prefer suite-level selection over
ad-hoc filters; perceived filtering has limitations. For exact single-test diagnostics,
preview the relevant Playwright config with `--grep` and `--list` before execution.
Direct Playwright invocation bypasses runner setup/validation and is not a recorded campaign.

## Preconditions and backend setup

- Use normal **development** Kupua, with a windowed corpus. Leave
  `VITE_JUSTIFIED_PREVIEW` unset; synthetic/resident sample modes are not campaign backends.
- Keep the browser visible and unobscured. Freeze application/configuration files while
  measuring: Vite reloads invalidate a run, including reloads caused by documentation saves.
- Use matching app and runner modes. The runtime fingerprint checks mode/topology, browser,
  viewport, DPR and other environment fields. A descriptive label is not proof of topology.
- Keep the pinned date cutoff, viewport, media/cache conditions and workload consistent when
  comparing. The cutoff does not freeze edits or deletions in the live corpus.
- Do not change resource limits, safeguards, authentication or server configuration just to
  make a failing measurement pass. No non-local ES writes.

Start the appropriate app, in a separate terminal:

```bash
./kupua/scripts/start.sh --use-TEST
# OR, with local Grid/media-api already running:
./kupua/scripts/start.sh --use-media-api
# OR, using deployed TEST media-api:
./kupua/scripts/start.sh --use-deployed-media-api
```

Local API means browser → local Vite/proxy → local media-api → TEST ES tunnel, **not**
deployed TEST media-api. Deployed API mode still uses local thumbnail/image delivery.
Both API campaign flags select the authenticated HTTPS Kupua origin; direct ES normally
uses localhost. Origin/proxy differences prevent treating every timing delta as API overhead.
The [application setup guide](../README.md#quick-start) owns broader infrastructure instructions.

For a **new/changed API setup or changed measured paths**, validate before recording:

```bash
npm --prefix kupua run test:perf -- --use-media-api --long-perceived-only --dry-run --runs 2 --label "API setup check"
```

Use the deployed flag instead when appropriate. Local media-api must have the reviewed TEST
`field.aliases` configuration: otherwise alias-backed metadata and filters can silently differ.
Where local setup uses `~/.grid/common.conf`, copy only the reviewed alias block, not an entire
TEST configuration, then restart media-api. For traversal, buffering or selection changes, also run the relevant focused jank dry checks
from [the rendering spec](perf.spec.ts). Preflights are **not** required before every repeat
campaign on an unchanged, already-validated setup.

### Authentication state

Playwright storage state contains live credentials. **Create and retain the real JSON outside
the repository**, with private permissions. Do not print it, paste it into chat, copy it into
Kupua or commit it. Interactive login is performed by the operator, not an agent.

```bash
mkdir -p "$HOME/.config/kupua-playwright"
chmod 700 "$HOME/.config/kupua-playwright"
kupua/node_modules/.bin/playwright codegen \
  --save-storage="$HOME/.config/kupua-playwright/panda-auth.json" \
  https://kupua.media.local.dev-gutools.co.uk
```

Sign in to [local Grid](https://media.local.dev-gutools.co.uk/) for local API mode, and to
[TEST Grid](https://media.test.dev-gutools.co.uk/) for deployed API/satellite services.
Cookies are domain-scoped; localhost cannot supply the authenticated local/TEST domains.
Close the codegen browser to write the state, then create the ignored symlink the runner expects:

```bash
chmod 600 "$HOME/.config/kupua-playwright/panda-auth.json"
ln -s "$HOME/.config/kupua-playwright/panda-auth.json" kupua/e2e-perf/.panda-auth.json
git check-ignore -q kupua/e2e-perf/.panda-auth.json
```

Do not overwrite an existing path blindly. An ignored regular credential file inside the repo
is **not** an acceptable substitute for the external file. Authentication failures/redirects and
empty authenticated responses invalidate the campaign; renew the private state rather than
interpreting them as latency. Remove only the symlink when finished if it is no longer needed.
