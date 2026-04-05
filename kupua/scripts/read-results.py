#!/usr/bin/env python3
"""Read the shared smoke test JSON report and print a summary."""
import json, sys, os

# Find the report file
script_dir = os.path.dirname(os.path.abspath(__file__))
report_path = os.path.join(script_dir, "..", "test-results", "smoke-report.json")

if not os.path.exists(report_path):
    # Fall back to old filename
    report_path = os.path.join(script_dir, "..", "test-results", "scroll-stability-report.json")

if not os.path.exists(report_path):
    print("No smoke report found in test-results/")
    sys.exit(1)

with open(report_path) as f:
    data = json.load(f)

tests = data.get("tests", {})
timestamp = data.get("timestamp", "unknown")
print(f"Report: {os.path.basename(report_path)}  ({timestamp})")
print(f"Tests recorded: {len(tests)}")
print()

# Sort by S-number numerically
def sort_key(tid):
    import re
    m = re.match(r"S(\d+)", tid)
    return int(m.group(1)) if m else 999

for tid in sorted(tests.keys(), key=sort_key):
    t = tests[tid]
    status = t.get("status", "passed")
    verdict = t.get("verdict", "")
    duration = t.get("duration")
    dur_str = f" ({duration}ms)" if duration else ""

    icon = "✅" if status != "failed" else "❌"
    verdict_str = f"  [{verdict}]" if verdict else ""

    print(f"  {icon} {tid}{dur_str}{verdict_str}")

    # Print test-specific details
    if "scenarios" in t:
        for s in t["scenarios"]:
            if "preScrollRows" in s:
                print(f"      preScrollRows={s['preScrollRows']}: delta={s.get('scrollDelta',0):.1f}, preserved={s.get('scrollPreserved')}")
            elif "name" in s:
                print(f"      {s['name']}: delta={s.get('delta',0):.1f}, preserved={s.get('preserved')}")

    if "results" in t and tid == "S24":
        for r in t["results"]:
            sr_b = r.get("subRowBefore", "?")
            sr_a = r.get("subRowAfter", "?")
            if isinstance(sr_b, (int, float)):
                print(f"      row={r['rowOffset']}: maxShift={r['maxShift']}, subRow: {sr_b:.1f} → {sr_a:.1f}")
            else:
                print(f"      row={r['rowOffset']}: maxShift={r['maxShift']}")

    if "error" in t and t.get("status") == "failed":
        err = str(t["error"])[:200]
        print(f"      ERROR: {err}")

print()

