# Intermittent E2E performance failures

Historical evidence from 18 October. The [current README](README.md) owns the later findings,
paused disposition and reusable instrumentation; this note is not an active task list.

## Disposition — 18 October 2026

- **Local API DNS failure mitigated:** the operator is keeping the hosts-file override below.
- **PP3 investigation parked by the operator:** reopen only if it recurs or is explicitly requested.
- Four short-only repetitions passed after the override, with no new captured Vite proxy errors.
  A subsequent full campaign also passed; its retained log confirms four repetitions of each
  selected suite. This does not establish that the separate PP3 backend timeout was fixed.
- No application, proxy or test implementation was changed. No Kupua-specific DNS change is planned.
  This note is a sanitized troubleshooting reference, not an implementation queue.

## Local API DNS failure and retained mitigation

Vite logged `getaddrinfo ENOTFOUND` while forwarding `/images/search-after` and an optional
quota request. The failed ordered read produced HTTP 502 before reaching local media-api.
Initial loads and filter changes could fail; this was not confined to one performance scenario.
A readiness timeout with `loading=false` and `error=true` was therefore reporting a genuine
failed request, not just a slow render.

The local `/api` proxy in [vite.config.ts](../../../vite.config.ts) used external DNS to resolve
its already-public local hostname back to loopback. The operator added and will retain:

```text
127.0.0.1 api.media.local.dev-gutools.co.uk
```

This `/etc/hosts` mapping bypasses external DNS for that hostname while preserving the hostname
used for HTTPS, nginx routing and authentication. It affects all applications resolving that
hostname, not just Kupua. It does not alter deployed API routing or the Elasticsearch tunnel.
Removing the entry reverses it; future Mac-setting changes still require explicit permission.

The entry and loopback resolution were verified using the running Vite's Node version. If this
failure returns, check the hosts entry and Node's system lookup first; `dig` queries DNS directly
and is not a test of the hosts override. Then inspect Vite's console for the underlying proxy
error. Do not replace the proxy URL with an IP blindly or weaken authentication/TLS safeguards.
The original cause of the intermittent external resolution failure was not established.

## PP3: focused-sort backend timeout — parked

PP3 changes sort with a focused image and requires the **original image** to remain visibly
focused. One captured failure had this sequence:

1. `/images/rank` reached local media-api.
2. About eight seconds later, both proxy layers recorded 499 (client closed the request).
3. The backend subsequently logged `SocketTimeoutException` at 30 seconds; the rank request
   duration was approximately 30,040 ms. Client cancellation had not ended the backend work.
4. PP3 failed after about 41 seconds, including its 30-second visual-observer deadline.
   The store was idle and error-free with correlated completion, but original-focus mismatch.

During that backend stall, 28 other Elasticsearch queries completed in 26–175 ms. The other
17 rank requests in the diagnostic campaign took 33–308 ms. This was not a complete outage;
a slow individual query, stalled pooled connection or tunnel/backend fault was not distinguished.
The request had already crossed the DNS boundary, so the hosts override is not a demonstrated
fix for this particular failure. Clean reruns are encouraging but do not establish causation.

### Code landmarks and interpretation

- [search-store.ts](../../../src/stores/search-store.ts): `_findAndFocusImage` can time out after
  eight seconds, publish first-page fallback and clear focus without setting the ordinary
  search error. The caller can then emit `t_store_ready`. That event does not prove preservation.
- [perceived-short.spec.ts](../../../e2e-perf/perceived-short.spec.ts): the PP3/PP4 observer requires
  correlated completion and the original focus. Its `itemPresent=false` is not independent proof
  of DOM absence: the snapshot first requires matching focus. Do not weaken this success contract.
- [ImageQueryController.scala](../../../../media-api/app/controllers/ImageQueryController.scala)
  and [ElasticSearch.scala](../../../../media-api/app/lib/elasticsearch/ElasticSearch.scala): rank
  uses a size-zero `_search` with exact total counting and sort-tuple predicates. Its ten-second
  ES query timeout is separate from both the client fallback and the observed socket timeout;
  it is not a hard end-to-end deadline. A socket timeout does not prove expensive query execution.

### If PP3 recurs

1. Keep the original-focus assertion and existing deadlines. Do not add sleeps/retries or count
   fallback as successful preservation merely to make the campaign pass.
2. Correlate browser/Vite, nginx and local media-api records by UTC timestamp and operation.
   Distinguish DNS/502, client cancellation/499 and backend timeout before choosing a fix.
3. If needed, add narrowly scoped diagnostic outcomes for preservation, fallback, timeout and
   supersession; use identity-equality flags rather than real image IDs. Reproduce the confirmed
   failure path with synthetic adapter/store/browser controls before implementation.
4. If rank reached media-api but stalled upstream, inspect the active tunnel route and approved
   backend telemetry. Two differently bound loopback tunnels were seen during investigation;
   that was not proof of a collision. Recheck current listeners rather than reuse old assumptions.
5. Change only the demonstrated cause, with an isolated failing-first regression. Do not increase
   timeouts, optimize rank queries or change fallback policy without evidence and approval.

## Logs, retention and privacy

Local media-api logs do not include everything happening in remote Elasticsearch. Useful sources:

| Layer | Where to look |
|---|---|
| Vite | Startup terminal or explicitly captured stdout **and stderr**. The campaign log does not capture this automatically. |
| Local nginx | Its configured access/error logs; compare outer `/api/images/...` with inner `/images/...` requests (/opt/homebrew/var/log/nginx/access[error].log). |
| Local media-api | Its application log and rotated files, plus startup terminal. Check time coverage before relying on them (media-api/logs/application.log). |
| Local tunnel | Terminal or explicitly enabled plugin logs; persistent plugin logging was not active when inspected. |
| Remote tunnel/backend | Approved SSM-agent and Elasticsearch logs/journal on the target instance; CloudWatch only if forwarding is configured. Port-forwarding session history is not an HTTP/query transcript. |

[run-audit.mjs](../../../e2e-perf/run-audit.mjs) writes timestamped invocation logs, normally under
`$TMPDIR`; `.latest-report-path` is only an overwritten pointer. Playwright output and metric
scratch files are reused, so another run can remove failure artifacts. Successful histories
exclude failed invocations and defer writes until all selected suites complete: they cannot
provide a failure rate. Perceived-short tracing was off; jank retained failure traces. Recheck
current configuration before assuming a trace exists.

Preserve needed evidence privately **before** another run. Do not copy or link raw logs, traces,
screenshots or API payloads into public documentation. Keep only endpoint categories, timings,
status/error codes and sanitized state flags. Exclude credentials, headers, signed URLs, queries,
image/user IDs, internal hosts and private session identifiers. Obtain permission before reading
sensitive tunnel/backend material or accessing shared live infrastructure.

For an operator-authorized reproduction, `--short-perceived-only` avoids the longer suites;
`--perceived-only` includes short and long, and `--perceived` also includes jank. Retain Vite
logging and the correct backend flag. `--dry-run` avoids benchmark-history updates but still
contacts the backend and writes temporary artifacts. No further campaign or investigation is
requested while PP3 remains parked.
