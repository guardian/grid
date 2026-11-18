/** Canvas view of the static call graph (callgraph.json), highlighting the code a feature or scenario ran. */
import { useEffect, useMemo, useRef, useState } from 'react';
import { CircleAlert, LoaderCircle, Network, Palette, X } from 'lucide-react';
import { featureFile } from './scenario-list.tsx';
import { ScenarioList } from './scenario-list.tsx';
import type { Selection } from './scenario-list.tsx';
import type { CallGraph, CoverageManifest } from './types.ts';

type LoadState = { status: 'loading' } | { status: 'missing' } | { status: 'error'; message: string }
  | { status: 'ready'; graph: CallGraph; coverage: CoverageManifest | null };
type View = 'functions' | 'modules';
interface Transform { scale: number; x: number; y: number }

interface GraphStyle {
  background: string;
  levelBand: string;
  label: string;
  calledFunction: string;
  uncalledFunction: string;
  calledModule: string;
  uncalledModule: string;
  hoveredNode: string;
  calledCall: string;
  uncalledCall: string;
  calledImport: string;
  uncalledImport: string;
  hoverPath: string;
  calledEndpoint: string;
  uncalledEndpoint: string;
  calledRequest: string;
  uncalledRequest: string;
  glow: string;
  calledPathOpacity: number;
  uncalledPathOpacity: number;
  glowSize: number;
}
type ColourKey = { [K in keyof GraphStyle]: GraphStyle[K] extends string ? K : never }[keyof GraphStyle];
type RangeKey = Exclude<keyof GraphStyle, ColourKey>;

const defaultStyle: GraphStyle = {
  background: '#333333', levelBand: '#ffffff', label: '#cccccc',
  calledFunction: '#00adee', uncalledFunction: '#c0504d',
  calledModule: '#00adee', uncalledModule: '#c0504d', hoveredNode: '#ffffff',
  calledCall: '#78dcff', uncalledCall: '#ff7b72', calledImport: '#78dcff', uncalledImport: '#ff7b72',
  hoverPath: '#ffffff', glow: '#00adee',
  calledEndpoint: '#ffbc01', uncalledEndpoint: '#c0504d', calledRequest: '#ffbc01', uncalledRequest: '#ff7b72',
  calledPathOpacity: 0.95, uncalledPathOpacity: 0.18, glowSize: 10,
};
// Bumped when defaults change, since the whole style is saved and would otherwise keep the old defaults.
const styleKey = 'grid-feature-library:callgraph-style:v3';
const colourGroups: [string, [ColourKey, string][]][] = [
  ['Nodes', [['calledFunction', 'Called function'], ['uncalledFunction', 'Uncalled function'], ['calledModule', 'Called module'], ['uncalledModule', 'Uncalled module'], ['calledEndpoint', 'Requested endpoint'], ['uncalledEndpoint', 'Unrequested endpoint'], ['hoveredNode', 'Hovered node']]],
  ['Paths', [['calledCall', 'Called call'], ['uncalledCall', 'Uncalled call'], ['calledImport', 'Called import'], ['uncalledImport', 'Uncalled import'], ['calledRequest', 'Made request'], ['uncalledRequest', 'Unmade request'], ['hoverPath', 'Hovered paths'], ['glow', 'Called path glow']]],
  ['Canvas', [['background', 'Background'], ['levelBand', 'Level bands'], ['label', 'Labels']]],
];
const rangeFields: [RangeKey, string, number, number, number][] = [
  ['calledPathOpacity', 'Called path opacity', 0, 1, 0.01], ['uncalledPathOpacity', 'Uncalled path opacity', 0, 1, 0.01], ['glowSize', 'Glow size', 0, 40, 1],
];

function loadStyle(): GraphStyle {
  try {
    return { ...defaultStyle, ...JSON.parse(localStorage.getItem(styleKey) ?? '{}') };
  } catch {
    return defaultStyle;
  }
}

/** Appends an alpha channel to a #rrggbb colour. */
const withAlpha = (hex: string, alpha: number) => `${hex}${Math.round(alpha * 255).toString(16).padStart(2, '0')}`;
/** World-space radius of a function dot. */
const dotRadius = 2.4;
/** Horizontal lanes per gap between levels, so edges from different sources don't overlap. */
const lanes = 16;

const basename = (file: string) => file.slice(file.lastIndexOf('/') + 1);
const truncate = (text: string, max: number) => text.length > max ? `${text.slice(0, max - 1)}…` : text;

function CallGraphView({ graph, coverage }: { graph: CallGraph; coverage: CoverageManifest | null }) {
  const [view, setView] = useState<View>('modules');
  const [feature, setFeature] = useState<number | 'all'>('all');
  const [scenario, setScenario] = useState<number | 'all'>('all');
  /** A feature or scenario hovered in the side list, shown in place of the selection until the pointer leaves. */
  const [preview, setPreview] = useState<Selection>();
  const [hover, setHover] = useState<{ id: number; left: number; top: number }>();
  const [style, setStyle] = useState(loadStyle);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [hideShared, setHideShared] = useState(true);
  useEffect(() => localStorage.setItem(styleKey, JSON.stringify(style)), [style]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const transform = useRef<Transform>({ scale: 1, x: 0, y: 0 });
  const draw = useRef(() => {});
  const shownFeature = preview ? preview.feature : feature;
  const shownScenario = preview ? preview.scenario : scenario;

  /** Functions every scenario in scope ran (the selected feature's scenarios, or all of them), removed from the graph when hidden. */
  const shared = useMemo(() => {
    const nodes = new Set<number>();
    if (!coverage || !hideShared) return nodes;
    const scope = new Set(coverage.scenarios.flatMap((entry, id) => shownFeature === 'all' || entry.feature === shownFeature ? [id] : []));
    if (scope.size < 2) return nodes;
    const runs = new Map<number, Set<number>>();
    for (const link of coverage.scenarioLinks) {
      const node = graph.coverage[link.fn];
      if (node < 0 || !scope.has(link.scenario)) continue;
      if (!runs.has(node)) runs.set(node, new Set());
      runs.get(node)!.add(link.scenario);
    }
    for (const [node, scenarios] of runs) if (scenarios.size === scope.size) nodes.add(node);
    return nodes;
  }, [graph, coverage, hideShared, shownFeature]);

  const covered = useMemo(() => {
    const nodes = new Set<number>();
    const add = (fn: number) => { if (graph.coverage[fn] >= 0 && !shared.has(graph.coverage[fn])) nodes.add(graph.coverage[fn]); };
    if (!coverage) return nodes;
    if (shownScenario !== 'all') coverage.scenarioLinks.forEach((link) => { if (link.scenario === shownScenario) add(link.fn); });
    else if (shownFeature !== 'all') coverage.links.forEach((link) => { if (link.feature === shownFeature) add(link.fn); });
    else coverage.functions.forEach((_, fn) => add(fn));
    return nodes;
  }, [graph, coverage, shownFeature, shownScenario, shared]);
  const coveredFiles = useMemo(() => new Set([...covered].map((id) => graph.functions[id].file)), [graph, covered]);
  const degree = useMemo(() => {
    const callers = graph.functions.map(() => 0);
    const callees = graph.functions.map(() => 0);
    for (const [from, to] of graph.calls) { callees[from]++; callers[to]++; }
    return { callers, callees };
  }, [graph]);
  const fileFunctions = useMemo(() => {
    const byFile: number[][] = graph.files.map(() => []);
    graph.functions.forEach((fn, id) => byFile[fn.file].push(id));
    return byFile;
  }, [graph]);
  const scenarios = coverage && feature !== 'all' ? coverage.scenarios.flatMap((entry, id) => entry.feature === feature ? [{ id, name: entry.name }] : []) : [];
  /** Endpoint nodes follow the view's own nodes, so endpoint e has id `base + e`. */
  const base = view === 'functions' ? graph.functions.length : graph.files.length;
  const callEdges = useMemo(() => view === 'functions' ? graph.calls.filter(([from, to]) => !shared.has(from) && !shared.has(to)) : graph.imports, [graph, view, shared]);
  const requestEdges = useMemo(() => {
    const pairs = new Set<string>();
    for (const [fn, endpoint] of graph.network) {
      if (view === 'functions' && shared.has(fn)) continue;
      pairs.add(`${view === 'functions' ? fn : graph.functions[fn].file}:${base + endpoint}`);
    }
    return [...pairs].map((pair) => pair.split(':').map(Number) as [number, number]);
  }, [graph, view, shared, base]);
  const edges = useMemo(() => [...callEdges, ...requestEdges], [callEdges, requestEdges]);
  const requested = useMemo(() => new Set(graph.network.filter(([fn]) => covered.has(fn)).map(([, endpoint]) => endpoint)), [graph, covered]);
  const isCovered = (id: number) => id >= base ? requested.has(id - base) : view === 'functions' ? covered.has(id) : coveredFiles.has(id);
  const pathCount = edges.filter(([from, to]) => isCovered(from) && isCovered(to)).length;
  const bands = view === 'functions' ? graph.functionRows : graph.moduleRows;
  const endpointPoint = (endpoint: number) => graph.endpoints[endpoint][view === 'functions' ? 'function' : 'module'];
  const extent = useMemo(() => {
    const nodes = [...(view === 'functions' ? graph.functions : graph.files), ...graph.endpoints.map((endpoint) => endpoint[view === 'functions' ? 'function' : 'module'])];
    const pad = view === 'functions' ? 60 : 70;
    return { left: Math.min(...nodes.map((node) => node.x)) - pad, right: Math.max(...nodes.map((node) => node.x)) + pad };
  }, [graph, view]);

  draw.current = () => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    const ratio = devicePixelRatio;
    const { scale, x, y } = transform.current;
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = style.background;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.setTransform(ratio * scale, 0, 0, ratio * scale, ratio * x, ratio * y);
    const point = (id: number) => id >= base ? endpointPoint(id - base) : view === 'functions' ? graph.functions[id] : graph.files[id];
    const bandOf = (y: number) => bands.findIndex((band) => y <= band.bottom);
    // Each edge runs vertically out of its source, along a horizontal lane in the adjacent gap, then vertically into its target.
    const strokeEdges = (list: [number, number][], colour: string, width: number, glow?: string) => {
      context.beginPath();
      for (const [from, to] of list) {
        const a = point(from);
        const b = point(to);
        const source = bandOf(a.y);
        const target = bandOf(b.y);
        const below = target > source || (target === source && source < bands.length - 1);
        const gapTop = below ? bands[source].bottom : bands[source - 1].bottom;
        const gapBottom = below ? bands[source + 1].top : bands[source].top;
        const lane = gapTop + ((gapBottom - gapTop) * ((from % lanes) + 0.5)) / lanes;
        context.moveTo(a.x, a.y);
        context.lineTo(a.x, lane);
        context.lineTo(b.x, lane);
        context.lineTo(b.x, b.y);
      }
      context.strokeStyle = colour;
      context.lineWidth = width / scale;
      if (glow && style.glowSize > 0) {
        // Shadow blur is in device pixels, unaffected by the zoom transform.
        context.shadowColor = glow;
        context.shadowBlur = style.glowSize * ratio;
      }
      context.stroke();
      context.shadowBlur = 0;
    };

    for (const band of bands) {
      context.fillStyle = withAlpha(style.levelBand, 0.06);
      context.fillRect(extent.left, band.top, extent.right - extent.left, band.bottom - band.top);
    }
    const [calledPath, uncalledPath] = view === 'functions' ? [style.calledCall, style.uncalledCall] : [style.calledImport, style.uncalledImport];
    strokeEdges(callEdges.filter(([from, to]) => !(isCovered(from) && isCovered(to))), withAlpha(uncalledPath, style.uncalledPathOpacity), 1);
    strokeEdges(requestEdges.filter(([from, to]) => !(isCovered(from) && isCovered(to))), withAlpha(style.uncalledRequest, style.uncalledPathOpacity), 1);
    strokeEdges(callEdges.filter(([from, to]) => isCovered(from) && isCovered(to)), withAlpha(calledPath, style.calledPathOpacity), 1.6, style.glow);
    strokeEdges(requestEdges.filter(([from, to]) => isCovered(from) && isCovered(to)), withAlpha(style.calledRequest, style.calledPathOpacity), 1.6, style.glow);
    if (hover) strokeEdges(edges.filter(([from, to]) => from === hover.id || to === hover.id), style.hoverPath, 1.6);
    const endpointSize = Math.max(9, 4 / scale);
    context.font = `${10 / scale}px 'Open Sans', sans-serif`;
    context.textAlign = 'center';
    for (const [endpoint, entry] of graph.endpoints.entries()) {
      const { x: ex, y: ey } = endpointPoint(endpoint);
      const active = requested.has(endpoint);
      context.fillStyle = active ? style.calledEndpoint : style.uncalledEndpoint;
      context.fillRect(ex - endpointSize / 2, ey - endpointSize / 2, endpointSize, endpointSize);
      context.fillStyle = active ? style.label : withAlpha(style.label, 0.6);
      // Endpoints sit five to a row, so fit each label to its fifth of the width at the current zoom (~6px a character).
      const maxChars = Math.max(6, Math.floor(((extent.right - extent.left) / 5) * scale / 6));
      context.fillText(truncate(`${entry.kind} ${entry.label}`, maxChars), ex, ey + endpointSize / 2 + 11 / scale);
    }
    if (view === 'modules') {
      for (const [id, file] of graph.files.entries()) {
        const active = coveredFiles.has(id);
        context.beginPath();
        context.arc(file.x, file.y, file.radius, 0, Math.PI * 2);
        context.fillStyle = active ? withAlpha(style.calledModule, 0.45) : withAlpha(style.uncalledModule, 0.6);
        context.fill();
        if (active) {
          context.strokeStyle = style.calledModule;
          context.lineWidth = 1.5 / scale;
          context.stroke();
        }
      }
      context.font = `${10 / scale}px 'Open Sans', sans-serif`;
      context.textAlign = 'center';
      for (const [id, file] of graph.files.entries()) {
        if (file.radius * scale < 6) continue;
        context.fillStyle = coveredFiles.has(id) ? style.label : withAlpha(style.label, 0.6);
        context.fillText(truncate(basename(file.path), 18), file.x, file.y + file.radius + 11 / scale);
      }
    } else {
      const radius = Math.max(dotRadius, 1.5 / scale);
      for (const pass of [false, true]) {
        context.beginPath();
        for (const [id, fn] of graph.functions.entries()) {
          if (covered.has(id) !== pass || shared.has(id)) continue;
          context.moveTo(fn.x + radius, fn.y);
          context.arc(fn.x, fn.y, radius, 0, Math.PI * 2);
        }
        context.fillStyle = pass ? style.calledFunction : style.uncalledFunction;
        context.fill();
      }
    }
    if (hover) {
      const node = point(hover.id);
      context.beginPath();
      if (hover.id >= base) {
        const size = Math.max(9, 4 / scale) + 6 / scale;
        context.rect(node.x - size / 2, node.y - size / 2, size, size);
      } else {
        context.arc(node.x, node.y, view === 'functions' ? Math.max(dotRadius, 1.5 / scale) + 3 / scale : graph.files[hover.id].radius + 3 / scale, 0, Math.PI * 2);
      }
      context.strokeStyle = style.hoveredNode;
      context.lineWidth = 2 / scale;
      context.stroke();
    }
    // Labels go last so lines don't cross them; the backing box keeps them legible over dense edges.
    context.font = `600 ${13 / scale}px 'Open Sans', sans-serif`;
    context.textAlign = 'left';
    for (const band of bands) {
      const text = `${band.label} · ${band.count}`;
      const y = band.top - 8 / scale;
      context.fillStyle = withAlpha(style.background, 0.85);
      context.fillRect(extent.left - 4 / scale, y - 14 / scale, context.measureText(text).width + 8 / scale, 19 / scale);
      context.fillStyle = style.label;
      context.fillText(text, extent.left, y);
    }
  };

  const fit = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const [minX, maxX] = [extent.left, extent.right];
    const [minY, maxY] = [bands[0].top - 30, bands[bands.length - 1].bottom];
    const scale = Math.min(canvas.clientWidth / (maxX - minX), canvas.clientHeight / (maxY - minY)) * 0.95;
    transform.current = { scale, x: canvas.clientWidth / 2 - ((minX + maxX) / 2) * scale, y: canvas.clientHeight / 2 - ((minY + maxY) / 2) * scale };
    draw.current();
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      canvas.width = canvas.clientWidth * devicePixelRatio;
      canvas.height = canvas.clientHeight * devicePixelRatio;
      draw.current();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();
    fit();
    // React's wheel listeners are passive, so zooming needs a native listener to stop the page scrolling.
    const zoom = (event: WheelEvent) => {
      event.preventDefault();
      const bounds = canvas.getBoundingClientRect();
      const factor = Math.exp(-event.deltaY * 0.0015);
      const { scale, x, y } = transform.current;
      const px = event.clientX - bounds.left;
      const py = event.clientY - bounds.top;
      transform.current = { scale: scale * factor, x: px - (px - x) * factor, y: py - (py - y) * factor };
      draw.current();
    };
    canvas.addEventListener('wheel', zoom, { passive: false });
    return () => {
      observer.disconnect();
      canvas.removeEventListener('wheel', zoom);
    };
  }, [graph]);
  useEffect(() => draw.current());
  useEffect(() => fit(), [view]);

  const drag = useRef<{ x: number; y: number }>(undefined);
  const nodeAt = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current!;
    const bounds = canvas.getBoundingClientRect();
    const { scale, x, y } = transform.current;
    const wx = (clientX - bounds.left - x) / scale;
    const wy = (clientY - bounds.top - y) / scale;
    const nodes = view === 'functions' ? graph.functions : graph.files;
    let best: number | undefined;
    let bestDistance = Infinity;
    for (const [id, node] of nodes.entries()) {
      if (view === 'functions' && shared.has(id)) continue;
      const distance = Math.hypot(node.x - wx, node.y - wy);
      const reach = view === 'functions' ? Math.max(dotRadius * 2, 6 / scale) : graph.files[id].radius;
      if (distance <= reach && distance < bestDistance) {
        best = id;
        bestDistance = distance;
      }
    }
    for (const endpoint of graph.endpoints.keys()) {
      const node = endpointPoint(endpoint);
      const distance = Math.hypot(node.x - wx, node.y - wy);
      if (distance <= Math.max(9, 8 / scale) && distance < bestDistance) {
        best = base + endpoint;
        bestDistance = distance;
      }
    }
    return best === undefined ? undefined : { id: best, left: clientX - bounds.left, top: clientY - bounds.top };
  };
  const chooseFeature = (next: number | 'all') => {
    setFeature(next);
    setScenario('all');
  };

  const hoveredEndpoint = hover && hover.id >= base ? hover.id - base : undefined;
  const hovered = hover && hoveredEndpoint === undefined && view === 'functions' ? graph.functions[hover.id] : undefined;
  const hoveredFile = hover && hoveredEndpoint === undefined ? graph.files[view === 'functions' ? graph.functions[hover.id].file : hover.id] : undefined;
  const requesters = hoveredEndpoint === undefined ? [] : graph.network.filter(([, endpoint]) => endpoint === hoveredEndpoint).map(([fn]) => fn);
  const nodeCount = view === 'functions' ? graph.functions.length - shared.size : graph.files.length;
  const coveredCount = view === 'functions' ? covered.size : coveredFiles.size;

  return <>
    <div className="coverage-tools">
      <div className="segmented" role="group" aria-label="Graph level">
        {(['functions', 'modules'] as const).map((option) => <button key={option} type="button" aria-pressed={view === option} onClick={() => { setView(option); setHover(undefined); }}>
          {option === 'functions' ? 'Functions' : 'Modules'}
        </button>)}
      </div>
      {coverage && <label className="coverage-option">Feature
        <select id="callgraph-feature" value={feature} onChange={(event) => chooseFeature(event.target.value === 'all' ? 'all' : Number(event.target.value))}>
          <option value="all">All feature files</option>
          {coverage.features.map(({ name, slug }, index) => <option key={slug} value={index}>{featureFile(slug)} · {name}</option>)}
        </select>
      </label>}
      {scenarios.length > 0 && <label className="coverage-option">Scenario
        <select id="callgraph-scenario" value={scenario} onChange={(event) => setScenario(event.target.value === 'all' ? 'all' : Number(event.target.value))}>
          <option value="all">All scenarios ({scenarios.length})</option>
          {scenarios.map(({ id, name }) => <option key={id} value={id}>{name}</option>)}
        </select>
      </label>}
      {coverage && <label className="coverage-option" title="Uses the selected feature's scenarios, or every scenario when no feature is selected">
        <input type="checkbox" checked={hideShared} onChange={(event) => setHideShared(event.target.checked)} />
        Exclude functions every {shownFeature === 'all' ? 'scenario' : 'scenario in this feature'} calls{hideShared && shared.size > 0 && ` (${shared.size})`}
      </label>}
      <button type="button" className="text-button" onClick={fit}>Reset view</button>
      <button type="button" className="icon-button" aria-label="Graph colours" title="Graph colours" aria-expanded={paletteOpen} aria-controls="callgraph-palette" onClick={() => setPaletteOpen(!paletteOpen)}><Palette aria-hidden="true" /></button>
      <span className="subtle">{coveredCount} of {nodeCount} {view} run · {pathCount} of {edges.length} {view === 'functions' ? 'calls' : 'imports'} on the path · {requested.size} of {graph.endpoints.length} endpoints requested</span>
    </div>
    <div className={coverage ? 'callgraph-layout' : undefined}>
    {coverage && <ScenarioList coverage={coverage} selected={{ feature, scenario }} onPreview={setPreview}
      onSelect={(next) => { setFeature(next.feature); setScenario(next.scenario); }} />}
    <div className="callgraph-stage">
      {paletteOpen && <div id="callgraph-palette" className="callgraph-palette" role="group" aria-label="Graph colours">
        <div className="callgraph-palette-heading"><strong>Graph colours</strong>
          <button type="button" className="icon-button" aria-label="Close graph colours" onClick={() => setPaletteOpen(false)}><X aria-hidden="true" /></button>
        </div>
        {colourGroups.map(([group, fields]) => <fieldset key={group}><legend>{group}</legend>
          {fields.map(([key, label]) => <label key={key}>
            <input type="color" value={style[key]} onChange={(event) => setStyle({ ...style, [key]: event.target.value })} />{label}
          </label>)}
        </fieldset>)}
        <fieldset><legend>Strength</legend>
          {rangeFields.map(([key, label, min, max, step]) => <label key={key} className="callgraph-palette-range">
            {label}<input type="range" min={min} max={max} step={step} value={style[key]} onChange={(event) => setStyle({ ...style, [key]: Number(event.target.value) })} />
          </label>)}
        </fieldset>
        <button type="button" className="text-button" onClick={() => setStyle(defaultStyle)}>Reset colours</button>
      </div>}
      <canvas ref={canvasRef} aria-label={`${view === 'functions' ? 'Function call' : 'Module import'} graph of Kahuna's browser code`} role="img"
        onPointerDown={(event) => { drag.current = { x: event.clientX, y: event.clientY }; event.currentTarget.setPointerCapture(event.pointerId); }}
        onPointerUp={() => { drag.current = undefined; }}
        onPointerLeave={() => setHover(undefined)}
        onPointerMove={(event) => {
          if (drag.current) {
            transform.current.x += event.clientX - drag.current.x;
            transform.current.y += event.clientY - drag.current.y;
            drag.current = { x: event.clientX, y: event.clientY };
            draw.current();
            return;
          }
          const next = nodeAt(event.clientX, event.clientY);
          if (next?.id !== hover?.id) setHover(next);
          else if (next && hover) setHover(next);
        }} />
      {hover && hoveredEndpoint !== undefined && <div className="callgraph-tooltip" style={{ left: hover.left + 14, top: hover.top + 14 }}>
        <strong>{graph.endpoints[hoveredEndpoint].kind} {graph.endpoints[hoveredEndpoint].label}</strong>
        {graph.endpoints[hoveredEndpoint].paths.length
          ? graph.endpoints[hoveredEndpoint].paths.map((url) => <code key={url} className="callgraph-path">{url}</code>)
          : <span>URL path unknown</span>}
        <span>{requested.has(hoveredEndpoint) ? 'Requested' : 'Not requested'} · from {requesters.length} {requesters.length === 1 ? 'function' : 'functions'} ({requesters.filter((fn) => covered.has(fn)).length} run)</span>
        {requesters.slice(0, 8).map((fn) => <span key={fn} className={covered.has(fn) ? 'run' : undefined}>
          {graph.functions[fn].name} · {basename(graph.files[graph.functions[fn].file].path)}:{graph.functions[fn].line}
        </span>)}
        {requesters.length > 8 && <span>…and {requesters.length - 8} more</span>}
      </div>}
      {hover && hoveredFile && <div className="callgraph-tooltip" style={{ left: hover.left + 14, top: hover.top + 14 }}>
        {hovered ? <>
          <strong>{hovered.name}</strong>
          <span>{hoveredFile.path}:{hovered.line}</span>
          <span>{covered.has(hover.id) ? 'Run' : 'Not run'} · {degree.callers[hover.id]} callers · {degree.callees[hover.id]} callees</span>
        </> : <>
          <strong>{basename(hoveredFile.path)}</strong>
          <span>{hoveredFile.path}</span>
          <span>{fileFunctions[hover.id].filter((id) => covered.has(id)).length} of {fileFunctions[hover.id].length} functions run</span>
        </>}
      </div>}
    </div>
    </div>
    <p className="subtle callgraph-note">Calls are found by static analysis and resolved by name, so dependency-injected and dynamic calls are best-effort; functions also link to callbacks defined inside them. Network endpoints are the fetch/$http URLs and Theseus link or action names each function uses; an endpoint counts as requested when a function that ran uses it. Drag to pan, scroll to zoom.</p>
  </>;
}

/**
 * Loads callgraph.json and, when present, coverage.json from `npm run features:build`.
 * @returns The graph once loaded, or a loading, missing-data or retryable error state.
 */
export function CallGraphPage() {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setState({ status: 'loading' });
    const fetchJson = async <T,>(url: string): Promise<T | null> => {
      const response = await fetch(url, { signal: controller.signal });
      if (response.status === 404) return null;
      if (!response.ok) throw new Error(`${url} request failed (${response.status})`);
      return response.json();
    };
    const load = async () => {
      try {
        const [graph, coverage] = await Promise.all([fetchJson<CallGraph>('callgraph.json'), fetchJson<CoverageManifest>('coverage.json')]);
        if (controller.signal.aborted) return;
        setState(graph ? { status: 'ready', graph, coverage } : { status: 'missing' });
      } catch (error) {
        if (!controller.signal.aborted) setState({ status: 'error', message: error instanceof Error ? error.message : String(error) });
      }
    };
    void load();
    return () => controller.abort();
  }, [attempt]);

  return <main id="detail" className="coverage-page" tabIndex={-1}>
    <div className="section-heading"><h2>Call graph</h2>
      {state.status === 'ready' && !state.coverage && <span className="subtle">No coverage data: run <code>npm test</code> to highlight call paths</span>}
    </div>
    {state.status === 'ready' ? <CallGraphView graph={state.graph} coverage={state.coverage} />
      : <div className="empty-state">{state.status === 'loading' ? <><LoaderCircle aria-hidden="true" /><h2>Loading call graph</h2></>
        : state.status === 'missing' ? <><Network aria-hidden="true" /><h2>No call graph</h2><p>Rebuild the library with <code>npm run features:build</code>.</p></>
          : <><CircleAlert aria-hidden="true" /><h2>The call graph is unavailable</h2><p>{state.message}</p><button className="text-button" onClick={() => setAttempt((previous) => previous + 1)}>Retry</button></>}
      </div>}
  </main>;
}
