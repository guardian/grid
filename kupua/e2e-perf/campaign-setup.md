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
| `--canonical-media` | Require returned media URLs; valid with either API flag. Without it, require proxy delivery. Must match app startup. |
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
# OR, with canonical media from that same API:
./kupua/scripts/start.sh --use-deployed-media-api --canonical-media
```

Local API means browser → local Vite/proxy → local media-api → TEST ES tunnel, **not**
deployed TEST media-api. Both API modes use local thumbnail/image delivery by default;
`--canonical-media` selects returned URLs without changing the API topology.
Both API campaign flags select the authenticated HTTPS Kupua origin; direct ES normally
uses localhost. Origin/proxy differences prevent treating every timing delta as API overhead.
The [application setup guide](../README.md#quick-start) owns broader infrastructure instructions.

### Proxy / canonical comparison

Run these separately, with the matching app mode already started. The runner does not
restart or reconfigure the app. `--full` supplies all three dashboards; use
`--suite justified` instead for density-only coverage.

```sh
set -o pipefail; npm --prefix kupua run test:perf -- --full --use-deployed-media-api --runs 4 --label "TEST API / proxy media" 2>&1 | tee "$TMPDIR/kupua-test-output.txt"
```

After restarting the app with `--use-deployed-media-api --canonical-media`:

```sh
set -o pipefail; npm --prefix kupua run test:perf -- --full --use-deployed-media-api --canonical-media --runs 4 --label "TEST API / canonical media" 2>&1 | tee "$TMPDIR/kupua-test-output.txt"
```

Keep source files, browser, viewport/DPR, corpus cutoff and network conditions unchanged
between arms. The Vite environment endpoint reports delivery; the fixture rejects a
mismatch before its workload and checks configuration again afterward. Repetitions and
histories also validate the observed fingerprint. Labels alone never select delivery.

These are **laptop-hosted development-app** campaigns, including the canonical arm.
The Kahuna-hosted TEST build is not a supported harness target: the harness needs Vite's
environment endpoint and source-module imports. This pair isolates delivery without
also changing application hosting/build. Canonical-versus-proxy does not isolate only
transport: returned renditions, quality and caches may differ too.

Campaign configs disable screenshots, traces, video and automatic failure snapshots;
these can retain live metadata or signed media URLs. Text diagnostics remain subject to
the repository's redaction rules. Do not enable raw capture to diagnose a live failure.
The installed Playwright version can still write `error-context.md` from errors and
code frames even with automatic page snapshots disabled. The filename alone does not
establish that a page snapshot was captured. Treat generated error-context files as
private; disabling snapshots is not a guarantee that all diagnostic files are absent.

### PP3 Private Debug Retention

The runner preserves an operator-approved exception for PP3's existing degraded/fallback
diagnostic: a separate end-of-campaign section prints focused media IDs and UTC action
starts, including when a later handled child failure ends the campaign. Ordinary metrics,
per-spec diagnostic lines, history and PP4 remain redacted. This is not an exception for
credentials, signed URLs, raw responses, screenshots or identity-bearing repository artifacts.

The child-to-runner handoff is external to the repository, bounded, directory 0700/file
0600, and removed after collection. Run reports are unique external temporary files with
mode 0600. Before a campaign, ensure `TMPDIR` is outside the repository and make
any existing `$TMPDIR/kupua-test-output.txt` mode 0600 before reusing it with
`tee`. Keep both terminal and runner logs private; never attach them to Git or public
issues. Retain them only until debugging is complete, then delete them. A force-killed
parent can leave the private handoff and may never print the final section; no cleanup
or early-failure media ID is promised for that path. See
[the exact diagnostic contract](measurement-reference.md#degraded-focused-sort-samples).

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

To renew an existing external cookie file, replace the placeholder and run:

```sh
kupua/node_modules/.bin/playwright codegen --save-storage="[enter path to your cookie file]" https://kupua.media.local.dev-gutools.co.uk
```

Close the codegen browser after signing in to save the state, then restart the campaign
from the beginning. The runner prints this same command and stops for missing state,
required app/API HTTP 401/419 or confirmed `/login` redirects. No automatic login,
new auth probe or partial-campaign resume is performed. Other failures keep their
existing classification; an auth-blocked attempt cannot append benchmark history.
The parent runner filters the known auth-interruption cascade and finishes with the
command as the last output line, exiting nonzero. It does not suppress ordinary
failure diagnostics or make expired cookies pass. Previously captured PP3 private
debug details still print before the final auth message.

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
