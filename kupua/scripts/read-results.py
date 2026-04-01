#!/usr/bin/env python3
import json, glob

files = sorted(glob.glob("e2e-perf/results/experiments/exp-2026-04-01-17*.json"))
for f in files:
    d = json.load(open(f))
    exp = d["experiment"]
    s = d.get("storeState", {})
    li = s.get("landingImage", {})
    snap = d.get("snapshot", {})
    ip = snap.get("imgproxy", {})
    steps = len(s.get("timings", []))

    print(f"\n{'='*70}")
    print(f"  {exp}  (steps={steps})")
    ch = li.get('cacheHit', '?')
    ar = li.get('alreadyRendered', '?')
    print(f"  Landing: renderMs={li.get('renderMs','?')} networkMs={li.get('networkMs','?')} cacheHit={ch} alreadyRendered={ar}")
    print(f"  Rendered: {s.get('renderedCount','?')}/{steps}  avg={s.get('avgRenderMs','?')}ms  max={s.get('maxRenderMs','?')}ms")
    print(f"  Imgproxy: requests={ip.get('requestCount','?')} cacheHits={ip.get('cacheHits','?')} avgMs={round(ip.get('avgDurationMs',0))}ms")
    print(f"  Swapped not rendered: {s.get('swappedButNotRendered','?')}")
    print(f"  Per-image:")
    for t in s.get("timings", []):
        tag = "RENDERED" if t.get("rendered") else "skipped "
        print(f"    [{t['i']:2d}] src={t['srcMs']:4d}ms  render={t['renderMs']:4d}ms  {tag}")

