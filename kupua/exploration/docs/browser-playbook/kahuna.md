# Kahuna Browser Operations

Optional legacy reference; do not load for ordinary Kupua work. Read the
[mandatory core](../embedded-browser-playbook.md#mandatory-core) and relevant
[network guidance](network-and-performance.md) first.

## Scope and Read-Only Guard

Obtain the URL, authorised backend stage and bounded read-only purpose. Kupua
permission does not implicitly cover another app/stage. Record frontend, actual
request path and backend separately; a Kupua control is not a Kahuna reproduction.

Before input, identify/block non-read-only producers, including automatic fetch/XHR/
beacon telemetry. Validate the guard with a safe control; do not rely on server
rejection. GET/HEAD-only gating can fit legacy reads but breaks Kupua's approved
POST reads. Disclose guard-induced errors/work changes and unprotected forms/workers/
frames; fetch/XHR/beacon coverage is not universal no-write proof. Do not weaken
server or ES safeguards.

## Search and Query Completion

Prefer visible controls for user-behaviour proof. Production Angular debug scopes
may be absent even when injector/`$state` remain available. Imperative router/service
probes are synthetic controls and must be labelled.

`$state.go()` completion is not response completion. Observe the relevant GET `/images`
and actual outgoing scope. A one-newest-hit summary read is not the viewport result
page or evidence about all results.

Use canonical syntax and a positive witness. The widget may remove a leading `+`
that imperative calls preserve; do not compare different executed queries. Scope
known witnesses in page memory; return counts/membership equality only. Discard a
contrast whose positive control fails.

## Detail and Singleton Reads

Visible image links can use `a[href^="/images/"]` filtered to contain an `img`.
Other matching anchors may be hidden; verify visible hit geometry.

Observe XHR/fetch singleton responses, not the HTML detail route. Keep URL, identities
and bodies transient; return safe bytes/status/timings. Zero cross-origin Resource
Timing size is not a cache hit: compare safe headers or in-memory decoded size where
authorised. Selecting samples can warm the server; sequential authenticated samples
are bounded observations, not load tests or cold benchmarks.

## Cleanup and Comparison Limits

Restore exact original XHR/fetch methods/listeners, including pre-existing app wrappers.
Stringifying an original function as "native" is not a cleanup oracle. Remove owned
guards after the protected workflow and verify cleanup before closure. For sequential
app operation, finish/clean the first before exercising the second.

Match canonical admission/query, media/cache and completion boundaries. Different
contracts/configurations need independent positive controls; router success, one
response size or warm timing proves neither correctness nor waste. Findings belong
in their owning investigation, not here.