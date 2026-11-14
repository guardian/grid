# Intermittent Elasticsearch HTTP transport failure

## Current position

**Investigation paused at operator request; cause unresolved, no corrective patch established.**
A real backend request has stalled. Prompt local request production/channel progress and an ES
incomplete-message warning after timeout do not establish where that request stops progressing.

- The final 19 October campaign completes **20 short-suite repetitions**, each 15 passed / 2 skipped.
  The Java recorder contains **2,875 successful operations**, no failed operation or timeout,
  and a clean `END STOPPED` with zero queue/association loss. This is a healthy control, not a fix.
- The laptop TCP capture reaches its **20,000-packet cap**, with zero reported kernel drops.
  Full-campaign paired coverage is not established; node final counters are not supplied.
  Do not retain or analyze successful raw traffic by default merely because it exists.
- **Temporary shared instrumentation is removed.** Both Scala files match HEAD and the two Java
  copies are absent. Grid and both captures are operator-stopped; no normal restart is performed.
  Kupua and unrelated changes are left untouched. No commits or pushes are made.
- A [single complete four-file patch](temporary-shared-instrumentation.patch) preserves the hooks
  and both Java helpers. [Exact reinstatement, capture and rollback commands](#reusable-instrumentation-runbook)
  are below. The reusable fixtures remain available, without installing anything in shared code.
- The recorder retains **no time limit**, an **8 MiB cap**, no rotation and bounded queues.
  Compression, framing, pooling, deadlines and cancellation behavior are unchanged.
- The latest genuine recurrence remains PP3 at **14:26 UTC on 19 October**. Its earlier private
  snapshot is not found in the temporary directories at closure; this document retains sanitized
  evidence, not a promise that old temporary files survive. No AWS changes or agent AWS access occur.
- Further observation is optional and requires fresh approval. If resumed, obtain paired byte-progress
  evidence, not another identical timeout/warning. Stop if either packet capture reaches its cap.

## File inventory

All reusable files are in this directory; none contains live captures or credentials.

| File | Purpose |
|---|---|
| [README.md](README.md) | Current outcome, evidence, limits and exact operator commands. |
| [earlier-e2e-perf-failures.md](earlier-e2e-perf-failures.md) | Earlier DNS mitigation, PP3 symptoms and artifact-retention evidence. |
| [temporary-shared-instrumentation.patch](temporary-shared-instrumentation.patch) | Complete reinstall/remove patch: two Scala hooks and two Java additions. Forward/reverse round trip verified. |
| [temporary-shared-client.patch](temporary-shared-client.patch) | Earlier Scala-only delta; reference only. Do not apply alongside the complete patch. |
| [TransportObserver.java](TransportObserver.java) | Bounded Apache transport events, byte counters and cached local socket ports. |
| [LocalTransportDiagnostics.java](LocalTransportDiagnostics.java) | Opt-in operation ownership and private metadata writer; no time limit, 8 MiB cap. |
| [HttpTransportProbe.java](HttpTransportProbe.java) | Synthetic encoding/framing, concurrency, reuse and socket-port matrix. |
| [DiagnosticControls.java](DiagnosticControls.java) | Deliberate buffering, timeout and cancellation controls. |
| [CaptureLimits.java](CaptureLimits.java) | Recorder duration, storage, flush and shutdown regressions. |
| [IntegrationProbe.scala](IntegrationProbe.scala) | Actual Scala/elastic4s integration with the temporary hooks installed. |
| [run.mjs](run.mjs) | Cached-dependency fixture runner and temporary-build cleanup. |

The complete patch targets `ElasticSearchClient.scala` and `ElasticSearchExecutions.scala` under
`common-lib/src/main/scala/com/gu/mediaservice/lib/elasticsearch/`, plus the two Java helpers under
`common-lib/src/main/java/com/gu/mediaservice/lib/elasticsearch/diagnostics/`. These shared changes
are currently **absent**, not installed. This README is the durable entry point; no separate session
handoff is needed. The [earlier failure note](earlier-e2e-perf-failures.md) retains DNS/PP3 evidence.
Successful captures and private temporary-file locators are not part of the reusable bundle.
Only shared routing/backlog/changelog references and the npm script live outside this directory.

## Evidence that matters

### Latest failure: 19 October 2026, 14:26 UTC

The campaign result is **14 passed, 2 skipped, 1 failed (PP3)** in repetition 1/20. The failed
operation is `IMAGE_RANK`, generated local operation/exchange **362**, connection alias **1**.
These are recorder counters, not real request/user/node identifiers. All times below are UTC
(15:26 local BST), independent of when the operator reports the failure.

| Boundary | Observation |
|---|---|
| Operation begins | 14:26:11.267 |
| Connection assignment | 14:26:11.268; about **0.850 ms** after operation start |
| First output callback | **423 compressed entity bytes** accepted; sampled channel delta 0 |
| Encoder complete | About **1.017 ms** after operation start; sampled channel delta **804 bytes** |
| Socket timeout | **14:26:41.296**; channel delta **809 bytes**; no response-header event |
| Local connection closes | 14:26:41.299 |
| Operation fails | 14:26:41.302; duration about **30,034.492 ms** |
| ES warning on operator-identified tunnel destination | **14:26:41.347**, about 51 ms after timeout / 48 ms after local close |

The ES exception is:

```text
PrematureChannelClosureException: Channel closed while still aggregating message
```

Its stack includes `MessageAggregator.channelInactive` and `HttpContentDecoder.channelInactive`.
The other node's selected-minute search has no matches. The duplicate pasted excerpts describe
one event, not independent confirmations. Private addresses and node/cluster identifiers are
excluded from this document.

The connection is **538.7 seconds old**, with **63 prior observed body-bearing completions**.
The previous observed completion is only **671.5 ms** before assignment. During the stall,
**24 other operations** start and complete successfully in roughly **23–272 ms**.

**Interpretation:** initial assignment and body production are prompt; a long idle interval,
hours-old connection or third test repetition is not necessary for this occurrence. The server
warning means a message is incomplete when the connection closes. It may be a consequence of
client timeout/closure, not the cause of the preceding stall. The timing and destination match
are strong, but **the local alias is not yet mapped to that exact remote TCP connection**.

The extra five channel bytes are consistent with flushing the final `0\r\n\r\n` chunk. The
final channel/entity difference is 386 bytes, also present in healthy rank controls. Neither
observation proves valid bytes reach ES: counters measure local channel acceptance, not TCP
acknowledgement, remote delivery or HTTP decoding. The decoder stack frame is not itself a
reported gzip error. **No SSM, gzip, residential-network or ES ownership claim follows yet.**

### Earlier evidence and controls: use, do not repeat blindly

| Evidence | What it establishes / does not establish |
|---|---|
| 18 October, 23:53:40–23:54:11 UTC | A search-after read times out after 30,045 ms while parallel rank completes in 158 ms. ES reports the same incomplete-message warning at 23:54:10.314, ~20 ms after timeout. Twenty-six other reads complete in 28–154 ms. This already establishes the timeout/warning pattern; today's added value is measured local send progress and ownership. |
| Original/plain-request/original A/B/A2 | A fails in repetition 3 (~30,062 ms); B passes four repetitions; restored A2 passes four. B retains response gzip. **Inconclusive**, not a compression fix. |
| Four-repeat instrumented control, 19 October | Each repetition reports 15 passed / 2 skipped. Capture contains 1,317 successful operations, including background/startup work; 224 search-after (max ~1,290 ms), 25 rank (max ~685 ms), six reused connections. Queue/association loss is zero. Healthy reference, not proof of reliability. |
| Earlier GC/SSM excerpts | Short GC pauses finish before the stalled request; SSM excerpts show routine activity. No established cause; repeating generic log searches is not the next discriminator. |
| Central media-api logs, operator's 15-day search | No `stack_trace: "SocketTimeoutException"` matches; positive control `stack_trace: "query failed because"` finds 316 entries. Supplied PROD example is upstream HTTP 502, a different signature. Coverage, workload parity and incident deduplication are unverified. |
| Full short suite versus PP3-only | The full short suite reproduces the failure. No validated minimal PP3-only or PP2+PP3 reproducer exists. Earlier workload can affect persistent backend connections even though browser contexts are fresh. |

### Separate issues, not this transport diagnosis

- **Local API DNS:** Vite `ENOTFOUND` causes an empty 502 before local media-api. The operator
  retains the hosts override for the already-public local API hostname. The current rank request
  crosses that boundary successfully. The [earlier failure note](earlier-e2e-perf-failures.md)
  owns the DNS evidence and reversal instructions. Its old “PP3 parked” disposition is historical.
- **PP3's visible failure:** focus preservation falls back after about eight seconds; the backend
  can continue until its 30-second socket timeout. The test used to reject missing original focus
  after a further 30-second wait, explaining roughly 41-second failures. Idle store state /
  `t_store_ready` can describe fallback, not preservation; this is not merely probe flakiness.
  Since 23 October, campaigns record the fallback as a [degraded PP3/PP4 sample](../../../e2e-perf/measurement-reference.md#degraded-focused-sort-samples)
  excluded from medians. Its end-of-campaign diagnostics retain UTC `t_0`, operation categories
  and per-request sent/response-header/outcome timings for correlation. Diagnostic revision 2
  redacts focused media identities and identity-bearing paths in ordinary output; exact-image
  reproduction is no longer available from ordinary artifacts. The operator subsequently
  approved a PP3-only end-of-campaign private debug section with the focused media ID and UTC
  start, retained only in private temporary logs until debugging is complete. Its separate
  handoff never enters metrics/history or repository artifacts; PP4 stays redacted. IDs already
  emitted survive a later handled child failure; failures before emission provide no ID.
  Delete private debug logs after investigation; abrupt parent termination can leave a handoff.
  This does not resume captures,
  fix the stall or change PP3/PP4 fallback acceptance.
- **Cancellation / [KUP-041](../../docs/bug-backlog.md#kup-041):** browser abort is not wired through
  Play/Scala Futures to outgoing ES cancellation; elastic4s discards the REST `Cancellable`.
  Separate controllers do not directly cancel another Java request. Aggregation cancellations
  occur four times per repetition in failing and passing A/B/A2 windows. This is a resource-lifetime
  follow-up, not a proven PP3 cause or permission to change cancellation policy.

## Next experiment: observe the existing ES node without deploying anything

**Optional next discriminator if reopened; no capture or campaign is currently active.** Earlier
passive observation and initial paired calibration are complete; any new observation needs fresh
approval. Existing node tools are tcpdump/ss; laptop tools are tcpdump/lsof. Calibration uses 200 packets per endpoint,
known socket filters and metadata-only terminal output, with zero reported kernel drops. A local
offline synthetic-packet check confirms the selected laptop summary format omits payload/header
contents. No install, deployment or service configuration change occurs.

One local-to-remote stream correspondence is strongly supported by the same ordered **15,812
request bytes** during the overlap, including distinctive larger requests. The final five-byte
chunk is often combined with preceding bytes on the remote stream; packet boundaries need not
match. Other connections lack sufficient overlapping activity to map. This is a calibration
result, not failure evidence or a complete mapping of future connections.

The operator approves the next capture filter: IPv4 loopback TCP involving port 9200 at each end,
**20,000 packets maximum per endpoint**, metadata-only text to new private temporary files. This
covers new pool connections but may include another local client; exclude non-loopback TEST traffic
and verify ownership/mapping before attributing events. On the node use `/tmp`, not the SSM agent's
working directory. The first actual paired campaign stops in repetition 3 with **PP6c initial-results failure**,
not a reproduced ES stall. At **16:48:38 UTC on 19 October**, local nginx records HTTP **419**
for search-after, count and aggregations on both outer and inner API routes. Grid's
[authentication handler](../../../../rest-lib/src/main/scala/com/gu/mediaservice/lib/auth/Authentication.scala)
defines 419 as `authentication-expired`. The Java recorder has no failed operation or socket
timeout in this attempt; the initial read is rejected before ES execution. Renew the operator's
private Playwright login state before another agreed campaign; do not treat this as transport
evidence. No credential file is read or copied during diagnosis.

The operator reports both captures stopped, but the saved tails lack final packet/drop counters;
loss status is unverified. Keep the node file private rather than transfer a large capture for an
authentication failure. Preserve packet-drop summaries, stop the campaign if either capture ends,
and remove only specifically named files after retention is agreed. Never commit raw captures.

The objective is to map the failing operation to one physical stream at each tunnel endpoint and
measure where byte progress stops. Another campaign without that new measurement has little
additional value.

### 1. Establish feasibility and permission before running tests

1. Agree the exact laptop/node observation commands, filters, output fields, storage bounds,
   retention and cleanup with the operator/transport owner. Remote observation can require `sudo`;
   read-only capture still introduces overhead and can expose sensitive traffic.
2. On the laptop and intended TEST ES node, check whether suitable packet/socket observation
   tools **already exist**. Do not install packages, deploy code, start a receiver, restart ES,
   change logging, security groups, tunnel settings or AWS resources. If the necessary tools are
   absent, stop and involve the owner rather than bootstrap a new setup.
3. Confirm the actual forwarding route and owning processes with narrowly scoped socket metadata.
   A separate IPv6 SSH listener is not proof of conflict with the observed IPv4 SSM route. Do not
   kill or reconfigure either. Record relevant client/plugin/remote-agent versions without dumping
   process arguments, environments, credentials or AWS session metadata.
4. Design a correlation check **before** the fault workload. The local Java-to-plugin TCP stream
   and remote forwarding-process-to-ES TCP stream are different connections, with different ports
   and TCP sequence spaces. SSM multiplexing hides their relationship; do not compare their raw
   sequence numbers or claim that similar timestamps prove identity.

### 2. Add only the missing connection evidence

- The local observer now records the actual ephemeral **local socket port**, using Apache's
  `HttpInetConnection.getLocalPort`, cached per connection so it survives closure. Schema 2 adds
  `local_port` immediately before `operation`; -1 means unassigned/unavailable. It records no
  IP addresses or hostnames. Local tests compare ports with the receiver's actual peer sockets
  across concurrent/reused connections and closure; the updated shared copies pass integration.
  The completed schema-2 controls confirm the addition works. Earlier schema-1 captures
  have no port field; parse by `HEADER`/`FIELDS`, not fixed offsets. A port plus lifetime/alias
  identifies the local leg, **not the corresponding remote leg**; port reuse must be accounted for.
- Observe TCP metadata at both endpoints simultaneously: laptop loopback between Java and the
  existing tunnel listener; node loopback between the forwarding process and ES. Confirm those
  interfaces/paths rather than assuming them. Record only timestamps, narrowly selected endpoint
  tuples, sequence/acknowledgement ranges, TCP payload lengths, flags and capture-drop counts.
- Keep endpoint tuples/private process metadata in approved private storage; publish only aliases
  and sanitized aggregates. No HTTP bodies, headers, URLs, credentials or editorial content in output.
- Use a reviewed **metadata-only text-output** method. Do not assume a packet “header capture” is
  payload-free: fixed snap lengths can include application bytes, packet/header sizes vary, and
  raw pcap files can retain secrets. No `-A`/`-X` payload display, broad wire logs or raw packet files
  under this plan. Filtering after writing sensitive data is too late.
- Establish local-to-remote connection correspondence from socket ownership/forwarding evidence
  and an unambiguous observed connection lifecycle. If metadata alone cannot establish it, record
  that blocker and ask the transport owner for a supported mapping method. Do not serialize the
  app, change pooling, add headers or restart the tunnel just to make correlation convenient.
- Verify timestamp offsets/precision between machines without changing clocks. Count unique TCP
  sequence coverage per stream, not summed packet lengths: retransmissions, segmentation,
  offloading and duplicate loopback observations can otherwise manufacture missing/extra bytes.
  Receiver ACKs confirm TCP-stack acceptance, **not application consumption or valid HTTP**.

### 3. Capture once, then inspect the new boundary

1. Validate selected observation tools on synthetic loopback traffic and verify that output has no
   payload fields. Check capture overhead and use narrow filters/bounded storage; do not launch
   an expensive full-interface capture on a shared ES node.
2. With mapping and recording verified, agree an operator-run short-suite budget. Keep the same
   backend/tunnel alive within the observation window; no automatic repeat-until-failure. The
   Java recorder has no elapsed cutoff at operator request, but its 8 MiB cap still applies.
   Node capture duration/storage requires a separate agreement, not inherited unlimited authority.
3. On the first relevant failure, stop the campaign, preserve pre-failure and timeout/close records,
   and obtain the matching existing ES warning. Capture the final chunk's progress timing rather
   than merely its cumulative count at 30 seconds. Do not rerun over Playwright artifacts.
4. Compare the failing stream with successful requests on the same connection, accounting for
   earlier traffic. Request boundaries come from the local observer; TCP streams do not inherently
   label HTTP requests. Report ambiguity or observation loss rather than filling gaps with guesses.

### Decision table

| New observation, with verified mapping and sufficient capture coverage | Next action |
|---|---|
| Java reports writes but matching bytes do not progress on the local connection | Investigate local socket/observation boundary first; verify capture completeness before claiming a client defect. |
| Local tunnel-side TCP accepts bytes, but corresponding remote stream does not forward them | Escalate with paired evidence to SSM/forwarding owners. This narrows the path, not necessarily which tunnel endpoint is faulty. |
| Remote stream delivers/ACKs the expected unique byte count, but ES still reports an incomplete message | Investigate HTTP framing/content validity and server receive/decode handling with maintainers. Equal counts do not prove equal/correct bytes, and ACKs do not prove ES consumes them. |
| Connection mapping is ambiguous, packets are dropped, or failure does not recur | State the exact missing boundary; stop at the agreed budget. Do not label the result proof of health or tunnel fault. |

Payload validation, library/ES instrumentation, a remote synthetic receiver, dependency changes or
an alternative tunnel/network comparison are **separate escalation proposals**. None is authorized
by this plan. The no-deployment experiment is passive observation using existing tools, not a
promise that metadata alone will identify the culprit.

## Existing recorder: contract and limitations

The inspected call chain is browser → frontend proxy/Vite → local API proxy → local media-api →
Java REST/Apache client → local SSM listener → remote forwarder → ES. The temporary hooks cover
only local backend execution and its Apache HTTP client.

| Record / field | Meaning |
|---|---|
| `HEADER` | Schema **2** for new captures (1 for previous evidence), UTC epoch-ms origin, size cap and duration ns; duration **0** means no recording deadline. |
| `local_port` | Actual local ephemeral TCP port cached for the connection lifetime; -1 if unavailable/unassigned. No addresses or remote mapping. |
| `OP` | Monotonic elapsed time, generated operation ID, allowlisted category and BEGIN/SUBMISSION_END/SUCCESS/FAILED. Unknown descriptions become OTHER. |
| `SUBMITTED` | Apache request interceptor before lease; not browser/API admission or exact REST submission time. |
| `ASSIGNED` | Request matched to connection after original request-ready callback; not exact pool-lease time. |
| `OUTPUT` / accepted bytes | Entity bytes accepted by encoder; compressed bytes for gzip, excluding HTTP framing. Encoder completion can precede socket-buffer flushing. |
| Channel delta | Apache sent-byte metric since assignment, including HTTP framing; sampled, not exact socket-write timestamp or acknowledgement. |
| Response / timeout / close | Original executor callbacks, not remote processing state. |
| `END` | Stop/size-limit reason and loss counts. `dropped_queue` means stream loss; `dropped_ring` alone means older in-memory entries wrap while streamed output may remain complete. |

Initial submission ownership uses the verified synchronous elastic4s → REST → Apache preparation
path and a scope restored in `finally`. No identity is inferred across asynchronous Futures;
retries/redirects or unscoped reads may be operation 0. Bodyless connection assignments remain
unsupported. The recorder now maps local aliases to local socket ports, but lacks exact
lease/release/idle timing, TCP ACKs, cross-tunnel identity and remote byte/framing completion.

The event schema holds numbers, booleans and enums only. Weak/capped associations avoid retaining
request bodies; a bounded queue drains on a daemon writer, not the transport thread. Existing files
and symlinks are not overwritten; non-loopback targets do not enable recording. Observer overhead
is not zero or benchmarked; instrumented timings are diagnostic, not comparable perf history.

## Reusable instrumentation runbook

The [complete patch](temporary-shared-instrumentation.patch) includes the two Scala hooks and both
Java helpers. It is sufficient to reinstall all four shared files; no separate copying is needed.
The [older Scala-only patch](temporary-shared-client.patch) is retained as a reference—**do not apply
both patches**. Java sources beside this README remain the maintainable fixture sources. If they
change, regenerate/revalidate the complete patch before using it.

This is an operator-run diagnostic, not a fix or an approved automatic campaign. Agree live TEST
read access, packet budget and campaign repetitions anew. Never deploy these hooks or write to ES.
No installs, AWS configuration changes, payload dumps, raw pcaps or credential inspection.

### 1. Reinstate while Grid is stopped

From the repository root, inspect unrelated work first. An agent needs explicit permission for
these four files outside Kupua. The patch is based on the shared source at `b1a616317`; stop on a
failed check or unexpected shared changes, rather than force/reject hunks or overwrite files.

```bash
git diff -- common-lib/src/main/scala/com/gu/mediaservice/lib/elasticsearch/ElasticSearchClient.scala common-lib/src/main/scala/com/gu/mediaservice/lib/elasticsearch/ElasticSearchExecutions.scala
git apply --check kupua/exploration/experiments/es-transport/temporary-shared-instrumentation.patch &&
  git apply kupua/exploration/experiments/es-transport/temporary-shared-instrumentation.patch
```

`git apply` creates the two Java files and refuses conflicting existing copies. It does not stage
or commit anything. Current fixtures already pass; if sources/dependencies have changed, validate
before live use, using the backend's documented JDK:

```bash
set -o pipefail
npm --prefix kupua run test:es-transport 2>&1 | tee "$TMPDIR/kupua-test-output.txt"
npm --prefix kupua run test:es-transport -- --integration-only 2>&1 | tee "$TMPDIR/kupua-test-output.txt"
```

Preserve any needed previous test output before either command overwrites it. The integration
fixture requires installed hooks, matching helper sources and cached app classes/dependencies.

### 2. Start local Grid with a new recorder

From the repository root, in the Grid terminal:

```bash
diag_file="${TMPDIR%/}/kupua-es-transport-$(date -u +%Y%m%dT%H%M%SZ)-$$.log"
printf 'SAVE THIS PATH: %s\n' "$diag_file"
KUPUA_ES_TRANSPORT_DIAGNOSTICS_FILE="$diag_file" dev/script/start.sh --use-TEST
```

Wait for `KUPUA_ES_DIAG: enabled; metadata only; no time limit; 8 MiB size cap`.
Verify the new file's `HEADER 2`, duration `0`, `local_port` field, open writer and remaining capacity
before capturing. Do not precreate the file: the recorder uses create-new/no-overwrite. The setting
is command-scoped; a later normal Grid restart does **not** enable recording automatically.
Keep the same backend/tunnel through the experiment. Startup performs the ordinary TEST setup;
it is not a deployment. Confirm which node the current tunnel actually targets after restarting.

Keep Kupua running in local media-api mode; if it is stopped, its normal command is:

```bash
./kupua/scripts/start.sh --use-media-api
```

Renew private Playwright state if needed using the [authentication instructions](../../../e2e-perf/README.md#authentication-state).
Do not read/copy the JSON or blindly recreate an existing symlink. A 419 is auth expiry, not ES evidence.

### 3. Start paired metadata captures

Use the existing browser SSM terminal on the **current tunnel-destination node**. First check for
leftover captures and identify SSM-to-ES loopback sockets; do not stop unrelated processes:

```bash
ps -C tcpdump -o pid,comm
sudo ss -ntp '( sport = :9200 or dport = :9200 )' | grep '127.0.0.1'
```

Node capture, after confirming no overlap and authorization:

```bash
tcp_log=$(mktemp /tmp/kupua-tcp-node.XXXXXX)
echo "SAVE THIS PATH: $tcp_log"
sudo tcpdump -i lo -nn -tt -S -l -s 96 -c 20000 'tcp and host 127.0.0.1 and port 9200' > "$tcp_log" 2>&1
```

In a separate Mac terminal, after checking no prior local capture remains:

```bash
tcp_log=$(mktemp "${TMPDIR%/}/kupua-tcp-local.XXXXXX")
echo "SAVE THIS PATH: $tcp_log"
sudo tcpdump -i lo0 -nn -tt -S -l -s 96 -c 20000 'tcp and host 127.0.0.1 and port 9200' > "$tcp_log" 2>&1
```

Both terminals are deliberately quiet. `mktemp` creates private text files. Direct redirection
retains stderr/drop counters without a `tee` process also receiving Ctrl+C. Verify file growth and
`listening on` before measuring, using another terminal if available; a printed path alone does
not prove tcpdump started. If the operator declines a second node terminal, record node readiness
as unverified. Keep both capture terminals visible and **stop the campaign if either returns to a
prompt**. The 20,000-packet cap can end before 20 repetitions; it is not a whole-campaign guarantee.
Do not silently increase the cap or remove it. No `-w`, `-A`, `-X` or generic wire logs.

### 4. Operator campaign

The previous agreed maximum was 20 short repetitions. Choose/confirm the next budget explicitly;
this command repeats that previous budget, not permission to run it automatically:

```bash
set -o pipefail
npm --prefix kupua run test:perf -- --use-media-api --short-perceived-only --dry-run --runs 20 --label "paired TCP transport diagnosis" 2>&1 | tee "$TMPDIR/kupua-test-output.txt"
```

Dry-run still reads TEST and writes local diagnostic reports; it does not append performance
history. Preserve needed earlier stdout/artifacts first. On the first failed repetition, do not
rerun. Classify auth/DNS/API versus backend timeout before requesting ES logs. Successful completion
without recurrence is not a fix. Stop both captures with Ctrl+C on failure, capture exit or campaign
completion. In **each capture's original terminal**, after it returns to a prompt:

```bash
tail -n 3 "$tcp_log"
```

Record captured/received/dropped counters; missing counters mean unknown loss, not zero.
Cross-tunnel mapping is per connection lifetime, not inherited from old calibration. TCP packet
boundaries/sequence numbers differ across the tunnel; use unique byte coverage and recorder ports.

### 5. Remove instrumentation while Grid is stopped

Inspect shared diffs and confirm the Java helpers still match the retained sources. Stop if any
concurrent edits are present. This reverses all four files, including deleting the added Java copies:

```bash
cmp kupua/exploration/experiments/es-transport/TransportObserver.java common-lib/src/main/java/com/gu/mediaservice/lib/elasticsearch/diagnostics/TransportObserver.java &&
  cmp kupua/exploration/experiments/es-transport/LocalTransportDiagnostics.java common-lib/src/main/java/com/gu/mediaservice/lib/elasticsearch/diagnostics/LocalTransportDiagnostics.java &&
  git apply --reverse --check kupua/exploration/experiments/es-transport/temporary-shared-instrumentation.patch &&
  git apply --reverse kupua/exploration/experiments/es-transport/temporary-shared-instrumentation.patch
git status --short -- common-lib/
```

Verify only the approved diagnostic delta disappears; never reset whole files or remove unrelated
changes. Restart normally only if wanted, from a shell without an exported diagnostic setting:

```bash
dev/script/start.sh --use-TEST
```

Leaving Grid stopped is a valid closure state; do not claim a normal runtime restart was verified.
The patch and fixture sources contain code, **not captures or credentials**. Successful raw captures
are not needed to reinstate instrumentation. Keep sanitized results here; delete only exact private
files after operator approval. Preserve targeted failure evidence privately if available, never in Git.

## Local validation and source findings

These tools validate measurement boundaries; none supplies a natural local reproduction of PP3.

| Tool / result | Coverage |
|---|---|
| [HttpTransportProbe.java](HttpTransportProbe.java): 1,920 complete requests, 32 expected incomplete rejections | Gzip/plain × chunked/fixed × normal/delayed receiver × observer enabled/disabled; three concurrent reused connections, exact bodies, terminal chunks and gzip responses. |
| [DiagnosticControls.java](DiagnosticControls.java): five passing controls | Encoder-complete with blocked channel; fully received request with delayed response; queued/during-send/late cancellation; unaffected concurrent/successor reads. |
| [CaptureLimits.java](CaptureLimits.java): passing regressions | Storage cap, finite and disabled duration, post-idle recording, manual flush/close and cleanup. |
| [IntegrationProbe.scala](IntegrationProbe.scala): passing enabled/disabled integration | Exact modified Scala execution trait + installed elastic4s adapter; concurrent ownership, unowned request, HTTP and synchronous failures, no context leakage, loopback/file-collision guards. |
| Selected offline frontend tests: 64 passed, 384 filtered out | Signal routing, abort/supersession and aggregation mocks; not backend transport/cancellation proof. |

[run.mjs](run.mjs) uses cached dependencies only and cleans temporary compilation. It opens only
synthetic loopback listeners, not ES/AWS/Vite. From repository root, with the backend's JDK:

```bash
set -o pipefail
npm --prefix kupua run test:es-transport 2>&1 | tee "$TMPDIR/kupua-test-output.txt"
```

Selectors: `--controls-only`, `--limits-only`, `--integration-only`. All have passing recorded
validation; integration requires the installed temporary Scala patch and byte-identical Java copies,
existing compiled classes and cached media-api classpath. It is not a full application build.
No need to rerun unchanged gates merely to continue evidence analysis. Live campaigns/dry runs
remain operator-run; they contact TEST even when benchmark history updates are disabled.

Relevant inspected versions: JDK 11.0.24, Scala 2.13.18, elastic4s 8.19.1, REST client 8.19.12,
HttpAsyncClient 4.1.5, HttpClient 4.5.14, HttpCore/NIO 4.4.16, Commons Logging 1.2. The standalone
fixture pins Commons Codec **1.15**; cached app integration uses **1.17.2**, not an equivalent full
classpath. Local SSM plugin is **1.2.764.0** at inspection; remote agent version remains unknown.
Recheck versions for new applicability claims, not by dumping sensitive runtime configuration.

Source conclusions that remain relevant:

- [Grid PR #4784](https://github.com/guardian/grid/pull/4784) enables outgoing gzip/chunking as well
  as response gzip. No evidence justifies reverting it. Per-request entities/streams are fresh;
  no shared mutable body or direct cross-request cancellation defect is demonstrated.
- Apache encoder completion can leave the zero chunk buffered; failed/cancelled exchanges are
  intended to discard the leased connection. Socket timeout defaults to 30 seconds; pool defaults
  are 10 per route / 30 total. The ES query timeout is not a hard transport deadline.
- Browser contexts are fresh per test, Playwright processes per repetition; backend pool/tunnel
  persist. No special third-short-repetition branch exists. Keep the full short workload until
  a reduced reproducer is demonstrated rather than assume PP3 or PP2+PP3 is sufficient.
- [Netty aggregation source](https://github.com/netty/netty/blob/d11f494dd52f5c0a1fb6f2c701bbdbba5dc01ab3/codec/src/main/java/io/netty/handler/codec/MessageAggregator.java#L434-L438)
  supports the incomplete-message interpretation, not causal ownership.
- [SSM plugin keep-alive gate](https://github.com/aws/session-manager-plugin/blob/1.2.764.0/src/sessionmanagerplugin/session/portsession/muxportforwarding.go#L170-L173)
  depends on remote agent version; [aws/session-manager-plugin#83](https://github.com/aws/session-manager-plugin/issues/83)
  is background, not a proven matching defect or justification for an upgrade.

## Evidence handling and simple operator log retrieval

ES application logs are under `/data/log` in the inspected setup; `/var/log/elasticsearch` holds
GC logs and the systemd journal can be empty. The launcher PID is not necessarily the JVM writing
application logs. ES JSON records span physical lines: timestamp-only grep omits stacks, last-line
tail can return only a frame, and line-by-line JSON parsing can silently skip records.

In the existing log directory, these short read-only commands retrieve the known recurrence:

```bash
sudo grep '2026-10-19T14:26:' grid-elasticsearch.json
sudo grep -A 12 '2026-10-19T14:26:41,347Z' grid-elasticsearch.json
```

Use the failure's UTC window, not the current time. If empty, verify file coverage/rotation and
format before drawing conclusions. Paste only timestamps/exception text; omit private headers,
addresses and IDs. Access logs/slowlogs are secondary evidence if needed, not guaranteed request
receipts; do not turn on new logging under read-only inspection permission.

Playwright artifacts and metric scratch files are overwritten; timestamped harness logs survive
but latest-report pointers do not preserve history. Successful histories exclude failed invocations
and cannot supply a failure-rate denominator. Vite stderr capture is separate and can become stale
after restart. Preserve failure evidence privately before any next run. Do not copy raw logs,
traces, screenshots, cookies, credentials, signed URLs, real queries or identifiers into this public
repository. This README owns the current evidence, paused disposition, decision limits and reusable
commands; transient session state and private capture paths do not belong in the publication bundle.
