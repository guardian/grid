import argparse
import bisect
import csv
import io
import json
import math
import os
from pathlib import Path
import re
import statistics
import subprocess
import sys


CHECKOUT = Path(__file__).resolve().parents[4]
EVENTS = (
    "RunTask", "ThreadControllerImpl::RunTask", "ThreadControllerImpl::DoWork",
    "FunctionCall", "EventDispatch", "FireAnimationFrame", "TimerFire", "RunMicrotasks",
    "V8.Execute", "EvaluateScript", "UpdateLayoutTree", "RecalculateStyles", "Layout",
    "PrePaint", "Paint", "Layerize", "UpdateLayerTree", "Commit", "BeginMainThreadFrame",
    "MajorGC", "MinorGC", "V8.GCScavenger", "V8.GCCompactor",
)


class AnalysisError(Exception):
    def __init__(self, stage, reason):
        self.stage = stage
        self.reason = reason


class Parser(argparse.ArgumentParser):
    def error(self, message):
        raise AnalysisError("arguments", "Invalid arguments; use --help")


def sql_string(value):
    return "'" + value.replace("'", "''") + "'"


def source_match(owner, source):
    if not source:
        return "0"
    url = f"EXTRACT_ARG({owner}.arg_set_id,'debug.data.url')"
    value = sql_string(source)
    return f"({url}={value} OR INSTR({url},{value}||'?')=1 OR INSTR({url},{value}||'#')=1)"


def integer(value):
    return None if value in (None, "", "[NULL]") else int(value)


def require(condition, stage, reason):
    if not condition:
        raise AnalysisError(stage, reason)


class Processor:
    def __init__(self, executable, trace):
        self.executable = executable
        self.trace = trace

    def query(self, stage, sql):
        try:
            result = subprocess.run(
                [self.executable, "query", "--format", "csv", str(self.trace), sql],
                capture_output=True, timeout=30, check=False,
            )
        except (OSError, subprocess.TimeoutExpired):
            raise AnalysisError(stage, "Trace processor unavailable or timed out") from None
        if result.returncode:
            missing = re.search(rb"no such (?:column|table): ([A-Za-z_][A-Za-z0-9_.]*)", result.stderr)
            detail = ": " + missing.group(1).decode() if missing else ""
            raise AnalysisError(stage, "Query failed; check source/schema coverage" + detail)
        require(len(result.stdout) <= 32 * 1024 * 1024, stage, "Query exceeded bounded output size")
        return list(csv.DictReader(io.StringIO(result.stdout.decode("utf8"))))


def union_ms(intervals):
    total = 0
    begin = finish = None
    for low, high in sorted(intervals):
        if begin is None:
            begin, finish = low, high
        elif low <= finish:
            finish = max(finish, high)
        else:
            total += finish - begin
            begin, finish = low, high
    return (total + (0 if begin is None else finish - begin)) / 1e6


def phase(name):
    if name in ("Layout", "UpdateLayoutTree", "RecalculateStyles"):
        return "style_layout"
    if name in ("PrePaint", "Paint", "Layerize", "UpdateLayerTree", "Commit", "BeginMainThreadFrame"):
        return "paint_commit"
    if name in ("FunctionCall", "EventDispatch", "FireAnimationFrame", "TimerFire", "RunMicrotasks", "V8.Execute", "EvaluateScript"):
        return "js_callback"
    return "gc" if "GC" in name else "other_task"


def phase_costs(rows, start, stop):
    intervals = []
    events = []
    for index, row in enumerate(rows):
        begin = max(start, int(row["ts"]))
        finish = min(stop, int(row["ts"]) + int(row["dur"]))
        if finish <= begin:
            continue
        intervals.append((begin, finish))
        events.extend(((begin, 1, index), (finish, -1, index)))
    active = set()
    totals = {}
    previous = start
    for timestamp, edge, index in sorted(events):
        if timestamp > previous and active:
            owner = max(active, key=lambda item: int(rows[item]["depth"]))
            category = phase(rows[owner]["name"])
            totals[category] = totals.get(category, 0) + (timestamp - previous) / 1e6
        if edge == 1:
            active.add(index)
        else:
            active.discard(index)
        previous = timestamp
    require(abs(sum(totals.values()) - union_ms(intervals)) < 0.001, "phase-costs", "Interval coverage mismatch")
    return {name: round(value, 3) for name, value in sorted(totals.items())}


def display_presentations(frames):
    selected = [row for row in frames if row["surface_class"] == "display"
                and integer(row["display_frame_token"]) not in (None, 0)
                and row["present_type"] != "Dropped Frame" and int(row["dur"]) >= 0]
    require(len({row["display_frame_token"] for row in selected}) == len(selected),
            "presentation-join", "Nonzero display tokens ambiguous; refine display context")
    return sorted(int(row["ts"]) + int(row["dur"]) for row in selected)


def select_renderer_scrolls(updates, results):
    handled = {row["scroll_update_id"] for row in results}
    selected = {row["scroll_id"] for row in updates if row["scroll_update_id"] in handled}
    return [row for row in updates if row["scroll_id"] in selected]


def movement_summary(updates, results, frames, dpr=None):
    displays = display_presentations(frames)
    require(bool(displays) and bool(updates) and bool(results), "motion", "Required motion/display sources are missing")
    require(all(row["scroll_id"] not in (None, "", "[NULL]") and row["scroll_update_id"] not in (None, "", "[NULL]") for row in updates),
            "motion", "Required gesture/update identifiers unavailable")
    require(all(row["scroll_update_id"] not in (None, "", "[NULL]") for row in results), "motion", "Input result identifiers unavailable")
    inputs = {row["scroll_update_id"]: row for row in results}
    require(len(inputs) == len(results), "motion", "Input result IDs are ambiguous")
    gestures = {}
    for update in updates:
        gestures.setdefault(update["scroll_id"], []).append(update)
    reports = []
    for ordinal, gesture in enumerate(sorted(gestures.values(), key=lambda group: int(group[0]["ts"])), 1):
        groups = {}
        for update in gesture:
            presentation = integer(update["presentation_timestamp"])
            source = inputs.get(update["scroll_update_id"])
            if presentation is not None and source is not None:
                require(int(source["ts"]) <= presentation, "motion", "Input handled after associated presentation")
                groups.setdefault(presentation, []).append((update, source))
        points = []
        for presentation, members in sorted(groups.items()):
            location = bisect.bisect_left(displays, presentation)
            neighbours = displays[max(0, location - 1):location + 1]
            error = min(abs(timestamp - presentation) for timestamp in neighbours)
            points.append({"ts": presentation, "valid": error <= 100_000,
                           "inertial": all(update["event_type"] == "INERTIAL_GESTURE_SCROLL_UPDATE" for update, source in members),
                           "unused": any(float(source["unused_delta_y"]) != 0 for update, source in members)})
        cadence = [float(row["vsync_interval_ms"]) for row in gesture
                   if row["vsync_interval_ms"] not in ("", "[NULL]") and float(row["vsync_interval_ms"]) > 0]
        require(bool(cadence), "motion", "Recorded vsync cadence unavailable")
        threshold = statistics.median(cadence) * 1.5
        gaps = []
        verified_pairs = 0
        for before, after in zip(points, points[1:]):
            if not (before["valid"] and after["valid"] and before["inertial"] and after["inertial"]):
                continue
            if before["unused"] or after["unused"]:
                continue
            verified_pairs += 1
            duration = (after["ts"] - before["ts"]) / 1e6
            if duration > threshold:
                intermediate = bisect.bisect_left(displays, after["ts"] - 100_000) - bisect.bisect_right(displays, before["ts"] + 100_000)
                gaps.append({"duration_ms": round(duration, 3), "intermediate_display_updates": intermediate})
        reports.append({"gesture": ordinal, "updates": len(gesture),
                "inertial_updates": sum(row["event_type"] == "INERTIAL_GESTURE_SCROLL_UPDATE" for row in gesture),
                "inertial_handled_results": sum(row["event_type"] == "INERTIAL_GESTURE_SCROLL_UPDATE" and row["scroll_update_id"] in inputs for row in gesture),
                "presentation_groups": len(points), "boundary_unused_groups": sum(point["unused"] for point in points),
                        "unmatched_presentation_groups": sum(not point["valid"] for point in points),
                "verified_inertial_pairs": verified_pairs,
                        "gap_threshold_ms": round(threshold, 3), "inertial_gap_candidates": gaps})
        require(any(row["verified_inertial_pairs"] for row in reports), "presentation-join",
            "No verified inertial presentation pairs; motion cannot be scored")
    consumed = sum(abs(float(row["provided_delta_y"]) - float(row["unused_delta_y"])) for row in results)
    return {"gestures": reports, "consumed_device_px": round(consumed, 3),
            "consumed_css_equivalent": round(consumed / dpr, 3) if dpr else None,
            "limits": ["Recorded inertial phases are not hardware contact edges",
                       "Presentation association does not independently prove changed pixels",
                       "System display updates may include other surfaces; verify foreground/context",
                       "Unmatched endpoints and boundary-unused input are excluded, not bridged"]}


def analyze(options):
    trace = Path(options.trace).resolve(strict=True)
    require(not trace.is_relative_to(CHECKOUT), "privacy", "Raw trace must be outside the checkout")
    processor = Processor(options.trace_processor, trace)
    markers = {row["name"]: integer(row["int_value"]) for row in processor.query("markers",
        "SELECT name,int_value FROM metadata WHERE name IN ('tracing_started_ns','all_data_source_started_ns','tracing_disabled_ns');")}
    start, stop = markers.get("tracing_started_ns"), markers.get("tracing_disabled_ns")
    require(start is not None and stop is not None and stop > start, "markers", "Complete service markers unavailable")
    window = f"events.ts >= {start} AND events.ts < {stop}"
    renderers = processor.query("renderer-discovery", f"""SELECT process.pid,thread.upid,thread.utid,
      COUNT(*) AS events,SUM(CASE WHEN events.name='FunctionCall' THEN 1 ELSE 0 END) AS callbacks,
            SUM(CASE WHEN events.name='FunctionCall' AND EXTRACT_ARG(events.arg_set_id,'debug.data.lineNumber') IS NOT NULL THEN 1 ELSE 0 END) AS callback_positions,
            SUM(CASE WHEN events.name='FunctionCall' AND {source_match('events', options.source)} THEN 1 ELSE 0 END) AS target_callbacks
      FROM slice events JOIN thread_track tracks ON tracks.id=events.track_id JOIN thread USING(utid)
      JOIN process ON process.upid=thread.upid WHERE thread.name='CrRendererMain' AND {window}
      GROUP BY process.pid,thread.upid,thread.utid ORDER BY process.pid;""")
    if options.list_renderers:
        require(bool(renderers), "renderer-discovery", "No renderer events; verify Chrome producer/source coverage")
        return {"renderers": [{name: int(value) for name, value in row.items()} for row in renderers],
                "warning": "PID/counts alone do not prove foreground application ownership"}
    integrity = processor.query("integrity", "SELECT name,severity,value FROM stats WHERE value!=0 AND (name LIKE '%overrun%' OR name LIKE '%overwrit%' OR name LIKE '%discard%' OR severity IN ('error','data_loss'));")
    report = {"schema_version": 1, "service_duration_ms": round((stop - start) / 1e6, 3),
              "all_sources_started_present": markers.get("all_data_source_started_ns") is not None,
              "integrity": integrity, "source_filter_configured": options.source is not None}
    if not options.frames_only:
        selected = [row for row in renderers if int(row["pid"]) == options.renderer_pid]
        require(len(selected) == 1, "renderer-selection", "Choose one independently verified renderer PID")
        utid = int(selected[0]["utid"])
        names = ",".join(sql_string(name) for name in EVENTS)
        rows = processor.query("main-slices", f"""SELECT events.id,events.ts,events.dur,events.depth,events.track_id,events.name
          FROM slice events JOIN thread_track tracks ON tracks.id=events.track_id
          WHERE tracks.utid={utid} AND {window} AND events.dur>=0 AND events.name IN ({names}) ORDER BY events.ts;""")
        require(bool(rows) and len({row["track_id"] for row in rows}) == 1,
                "main-slices", "Missing or multiple timed tracks; refine selection")
        tasks = [(int(row["ts"]), min(stop, int(row["ts"]) + int(row["dur"]))) for row in rows if row["name"] == "RunTask"]
        require(bool(tasks), "main-slices", "Main task source unavailable")
        matches = source_match("callbacks", options.source)
        attribution = processor.query("layout-attribution", f"""WITH owned AS (
          SELECT events.id,events.name,events.dur,callbacks.id AS callback_id,
          CASE WHEN EXTRACT_ARG(callbacks.arg_set_id,'debug.data.lineNumber') IS NULL THEN 'source-unavailable'
                        WHEN {matches} THEN 'target-source' ELSE 'other-source' END AS source_class,
                    CASE WHEN {matches} THEN EXTRACT_ARG(callbacks.arg_set_id,'debug.data.lineNumber') END AS generated_line,
                    CASE WHEN {matches} THEN EXTRACT_ARG(callbacks.arg_set_id,'debug.data.columnNumber') END AS generated_column,
          ROW_NUMBER() OVER(PARTITION BY events.id ORDER BY callbacks.depth DESC) AS nearest
          FROM slice events JOIN thread_track tracks ON tracks.id=events.track_id
          JOIN ancestor_slice(events.id) callbacks ON callbacks.name='FunctionCall'
          WHERE tracks.utid={utid} AND {window} AND events.name IN ('Layout','UpdateLayoutTree') AND events.dur>=0)
          SELECT name,source_class,generated_line,generated_column,COUNT(*) AS operations,
            ROUND(SUM(dur)/1e6,3) AS inclusive_ms,MIN(callback_id) AS example_callback_id
          FROM owned WHERE nearest=1 GROUP BY name,source_class,generated_line,generated_column ORDER BY operations DESC;""")
        report.update({"renderer_pid": options.renderer_pid,
                       "callback_coverage": {name: int(selected[0][name]) for name in ("callbacks", "callback_positions", "target_callbacks")},
                       "main_task_union_ms": round(union_ms(tasks), 3), "exclusive_selected_phase_ms": phase_costs(rows, start, stop),
                       "layout_operations": sum(row["name"] == "Layout" for row in rows),
                       "layout_attribution_inclusive": [{"operation": row["name"], "source_class": row["source_class"],
                           "generated_line": integer(row["generated_line"]), "generated_column": integer(row["generated_column"]),
                           "operations": int(row["operations"]), "inclusive_ms": float(row["inclusive_ms"]),
                           "example_callback_id": int(row["example_callback_id"])} for row in attribution],
                       "cost_limits": ["Wall time is not CPU time; unselected work is not certified absent",
                                       "Do not add inclusive attribution rows to exclusive phase costs",
                                       "Generated offsets need the exact served source; no source URLs are exported"]})
    if options.motion or options.frames_only:
        package = sql_string(options.package)
        frames = processor.query("frames", f"""SELECT events.ts,events.dur,events.display_frame_token,events.present_type,
          CASE WHEN events.surface_frame_token IS NULL THEN 'display' ELSE 'app' END AS surface_class
          FROM actual_frame_timeline_slice events WHERE {window}
          AND (events.surface_frame_token IS NULL OR INSTR(events.layer_name,{package})>0) ORDER BY events.ts;""")
        require(bool(frames), "frames", "FrameTimeline source unavailable")
        displays = display_presentations(frames)
        report["frames"] = {"scope_records": len(frames), "presented_display_records": len(displays),
                            "app_surface_records": sum(row["surface_class"] == "app" for row in frames),
                            "dropped_records": sum(row["present_type"] == "Dropped Frame" for row in frames),
                            "scope": "System display records and selected package surfaces; verify display/application context"}
        if options.motion:
            require(report["frames"]["app_surface_records"] > 0, "frames", "No selected-package surface; verify application/layer context")
            updates = processor.query("scroll-updates", f"""INCLUDE PERFETTO MODULE chrome.scroll_jank.scroll_offsets;
              SELECT scroll_update_id,scroll_id,ts,presentation_timestamp,vsync_interval_ms,event_type
              FROM chrome_gesture_scroll_updates WHERE ts>={start} AND ts<{stop} ORDER BY ts;""")
            results = processor.query("input-results", f"""SELECT events.ts,
              EXTRACT_ARG(events.arg_set_id,'scroll_deltas.trace_id') AS scroll_update_id,
              EXTRACT_ARG(events.arg_set_id,'scroll_deltas.provided_to_compositor_delta_y') AS provided_delta_y,
              EXTRACT_ARG(events.arg_set_id,'scroll_deltas.unused_delta_y') AS unused_delta_y
              FROM slice events JOIN thread_track tracks ON tracks.id=events.track_id JOIN thread USING(utid)
              WHERE thread.upid={int(selected[0]['upid'])} AND {window}
              AND events.name='InputHandlerProxy::HandleGestureScrollUpdate_Result' ORDER BY events.ts;""")
            updates = select_renderer_scrolls(updates, results)
            report["motion"] = movement_summary(updates, results, frames, options.dpr)
    return report


def self_test():
    rows = [{"ts": "0", "dur": "10000000", "depth": "0", "name": "RunTask"},
            {"ts": "1000000", "dur": "7000000", "depth": "1", "name": "FunctionCall"},
            {"ts": "3000000", "dur": "2000000", "depth": "2", "name": "Layout"},
            {"ts": "6000000", "dur": "1000000", "depth": "2", "name": "MinorGC"}]
    assert phase_costs(rows, 0, 10_000_000) == {"gc": 1.0, "js_callback": 4.0, "other_task": 3.0, "style_layout": 2.0}
    assert union_ms([(0, 10), (2, 5), (8, 12)]) == 12 / 1e6
    frames = [{"surface_class": "display", "display_frame_token": str(index), "present_type": "On-time Present",
               "ts": str(index * 16_000_000), "dur": "0"} for index in range(1, 5)]
    frames += [{"surface_class": "display", "display_frame_token": "0", "present_type": "Dropped Frame", "ts": "1", "dur": "0"}] * 2
    updates, results = [], []
    for index, timestamp in enumerate((16_000_000, 32_000_000, 64_000_000, 96_000_000), 1):
        updates.append({"scroll_id": "synthetic", "scroll_update_id": str(index), "ts": str(timestamp - 2_000_000),
                        "presentation_timestamp": str(timestamp), "event_type": "INERTIAL_GESTURE_SCROLL_UPDATE", "vsync_interval_ms": "16"})
        results.append({"scroll_update_id": str(index), "ts": str(timestamp - 1_000_000), "provided_delta_y": "-10", "unused_delta_y": "0"})
    summary = movement_summary(updates, results, frames, 2)
    assert summary["gestures"][0]["inertial_gap_candidates"] == [{"duration_ms": 32.0, "intermediate_display_updates": 1}]
    assert summary["gestures"][0]["unmatched_presentation_groups"] == 1
    assert summary["consumed_css_equivalent"] == 20
    pending = {**updates[-1], "scroll_update_id": "unhandled", "presentation_timestamp": "[NULL]"}
    other = {**pending, "scroll_id": "other-renderer", "scroll_update_id": "other"}
    scoped = select_renderer_scrolls(updates + [pending, other], results)
    scoped_summary = movement_summary(scoped, results, frames)
    assert scoped_summary["gestures"][0]["inertial_updates"] == 5
    assert scoped_summary["gestures"][0]["inertial_handled_results"] == 4
    assert len(scoped_summary["gestures"]) == 1
    results[2]["unused_delta_y"] = "-10"
    assert movement_summary(updates, results, frames)["gestures"][0]["inertial_gap_candidates"] == []
    try:
        display_presentations(frames + [frames[0]])
        raise AssertionError("Ambiguous display token accepted")
    except AnalysisError:
        pass
    try:
        movement_summary([{**updates[0], "scroll_id": "[NULL]"}], results, frames)
        raise AssertionError("Missing gesture identity accepted")
    except AnalysisError:
        pass
    try:
        movement_summary(updates[:1], results, frames)
        raise AssertionError("Motion scored without a verified pair")
    except AnalysisError:
        pass
    assert sql_string("sample'quote") == "'sample''quote'"
    assert "synthetic" not in json.dumps(summary)
    print(json.dumps({"self_test": "passed", "device_access": False, "trace_processor_started": False, "files_written": False}))


def main():
    parser = Parser(description="Offline allowlisted Android Chrome cost/motion summaries; no captured artifacts are bundled.")
    parser.add_argument("--trace")
    parser.add_argument("--trace-processor", default=os.environ.get("TRACE_PROCESSOR_SHELL", "trace_processor_shell"))
    parser.add_argument("--renderer-pid", type=int)
    parser.add_argument("--source")
    parser.add_argument("--package")
    parser.add_argument("--dpr", type=float)
    parser.add_argument("--list-renderers", action="store_true")
    parser.add_argument("--frames-only", action="store_true")
    parser.add_argument("--motion", action="store_true")
    parser.add_argument("--self-test", action="store_true")
    options = parser.parse_args()
    if options.self_test:
        self_test()
        return
    require(bool(options.trace), "arguments", "--trace is required")
    require(not (options.list_renderers and (options.frames_only or options.motion)), "arguments", "Choose renderer listing or analysis, not both")
    require(not (options.frames_only and options.motion), "arguments", "Motion requires renderer selection")
    if not options.list_renderers and not options.frames_only:
        require(options.renderer_pid is not None and options.renderer_pid > 0, "arguments", "An independently verified renderer PID is required")
    if options.motion or options.frames_only:
        require(bool(re.fullmatch(r"[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+", options.package or "")), "arguments", "An explicit Android package is required")
    if options.dpr is not None:
        require(math.isfinite(options.dpr) and options.dpr > 0, "arguments", "DPR must be a measured positive value")
    if options.source is not None:
        from urllib.parse import urlsplit
        source = urlsplit(options.source)
        require(source.scheme in ("http", "https") and bool(source.hostname) and not source.username
                and not source.password and not source.query and not source.fragment,
                "arguments", "Source must be an unsigned script URL without credentials, query or fragment")
    print(json.dumps(analyze(options), indent=2))


if __name__ == "__main__":
    try:
        main()
    except AnalysisError as error:
        print(json.dumps({"failed": True, "stage": error.stage, "reason": error.reason}), file=sys.stderr)
        sys.exit(2)
    except (OSError, ValueError, KeyError, csv.Error):
        print(json.dumps({"failed": True, "stage": "input-or-schema", "reason": "Required file/field/value unavailable; raw details withheld"}), file=sys.stderr)
        sys.exit(2)