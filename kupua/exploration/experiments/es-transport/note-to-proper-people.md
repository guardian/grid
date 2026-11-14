# Two Elasticsearch transport incidents for investigation

All times UTC. These are separate observations, not a demonstrated common fault. No configuration change or fix is proposed on this evidence alone. Hostnames, addresses, infrastructure identifiers and credentials are omitted.

## 1. TEST media-api: immediate connection reset — 24 October 2026

At **01:49:01**, TEST media-api's `POST /images/count`, called from local Kupua, failed with an Elasticsearch-client `SocketException: Connection reset`. Request duration: **11 ms**; logged ES-operation duration: **4 ms**. Three error records describe the same apparent incident, not three independent failures.

- The configured ES endpoint is an **Application Load Balancer**, HTTP:9200, with a **60-second idle timeout**.
- The operator reported minimum healthy targets **2**, maximum unhealthy **0** for the inspected incident window. This does not rule out individual connection failures.
- No matching entries were found in the inspected ES application logs. ALB connection-error/5XX charts returned **“No data available”**, not confirmed zero.
- The GC excerpt supplied was from a different time and does not explain this failure.

**Cause unresolved.** Reuse of an idle-closed pooled connection is one hypothesis; the failed connection's idle age and the origin of the reset are unknown. No established link to focus preservation or the PP3 timeout below.

**Useful developer check:** review client pooled-connection lifetime/idle handling against ALB behaviour and correlate any recurrence with the actual connection destination. Raising the ALB timeout is not an evidenced fix.

## 2. PP3 focused-sort probe: 30-second backend stall — 19 October 2026

PP3 changes sort while requiring the original image to remain visibly focused. At **14:26:11.267**, its rank operation began in local media-api, using the laptop-to-TEST-ES tunnel path. It failed at **14:26:41.302**, after approximately **30,034 ms**, with a socket timeout and no observed response-header event.

- Connection assignment and request encoding completed within approximately **1 ms**. Local channel counters showed bytes accepted; this does **not** prove delivery to or decoding by ES.
- The connection was approximately **539 seconds old**, with **63 prior observed body-bearing completions**; the previous completion was only **672 ms** before this request. A long idle interval was not required for this occurrence.
- **24 other operations completed successfully** during the stall, in approximately **23–272 ms**: this was not a complete backend outage.
- At **14:26:41.347**, the operator-identified tunnel destination logged `PrematureChannelClosureException: Channel closed while still aggregating message`, approximately **48 ms after local connection closure**. This may be a consequence of timeout/closure, not the cause of the stall. The exact remote TCP connection was not conclusively mapped.
- An earlier PP3 capture showed focus falling back after roughly **8 seconds**, while backend work continued to its **30-second** timeout. This establishes a possible user-visible consequence, not the transport cause.

**Cause unresolved.** No demonstrated ownership by ES, the tunnel, compression or the client. Later **20 short-suite repetitions passed**, with **2,875 successful recorded operations**, but no corrective patch was established; that is a healthy control, not proof of a fix. Temporary shared instrumentation was removed and the investigation was paused.

**Useful developer check:** if investigation resumes, obtain approved, bounded client/server byte-progress evidence for the same failing connection. Repeating the timeout plus incomplete-message warning alone will not locate the fault. Do not weaken the focus assertion or increase deadlines to make the probe pass.

Details and evidence limits: [transport investigation](README.md#evidence-that-matters) and [earlier PP3 findings](earlier-e2e-perf-failures.md#pp3-focused-sort-backend-timeout--parked).

## 3. Logging: small improvements worth making

**Better fields, not more logs.** Both legacy and new endpoints already share request IDs, operation labels and request/ES-client timings. New endpoints add more specific operation names and reject incomplete ES results. Their POST bodies also stay out of ordinary access logs; preserve that privacy advantage. Transport errors still inherit the shared “unknown type” fallback.

Suggested order, subject to developer review:

1. **Classify failures in the shared ES helper:** searchable categories such as `connection_reset`, `socket_timeout`, `connection_refused`, `es_response_error`, `unknown`, plus exception class and existing request ID. Describe symptoms, not guessed causes. This benefits old endpoints too.
2. **Separate “ES replied” from “endpoint succeeded”:** the helper currently logs success before new endpoints check completeness and potentially return 503. Make `timedOut`, `failedShards` and endpoint outcome/error code structured fields. Clearly distinguish request duration from ES-client elapsed time; neither is ES execution time alone.
3. **Connect browser failures to Kibana:** return the server-generated request ID in a response header and retain it in Kupua diagnostics. Handle cross-origin header exposure and framework-generated errors. The inspected filter/adapter do not currently provide this connection.

**Not recommended:** body/query/cursor/PIT/image-ID logging, additional identity data, duplicate stack traces or permanent packet tracing. Keep fields bounded and reuse existing records where possible. Endpoint logging cannot identify the ES target behind the ALB without infrastructure-side evidence. These changes would improve diagnosis, not fix either incident, and should not block focus-preservation work. No implementation is authorized by this note.

Code: [shared ES logging](../../../../common-lib/src/main/scala/com/gu/mediaservice/lib/elasticsearch/ElasticSearchExecutions.scala), [request filter](../../../../rest-lib/src/main/scala/com/gu/mediaservice/lib/play/RequestLoggingFilter.scala), [new endpoints](../../../../media-api/app/controllers/ImageQueryController.scala), [legacy search](../../../../media-api/app/controllers/MediaApi.scala), [ES completeness checks](../../../../media-api/app/lib/elasticsearch/ElasticSearch.scala), [Kupua adapter](../../../src/dal/grid-api-search-adapter.ts).
