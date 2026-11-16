/** Feature → function Sankey built from coverage.json, the scraped per-feature browser coverage. */
import { useEffect, useMemo, useState } from 'react';
import { CircleAlert, LoaderCircle, Search, Workflow } from 'lucide-react';
import type { CoverageManifest } from './types.ts';

type LoadState = { status: 'loading' } | { status: 'missing' } | { status: 'error'; message: string } | { status: 'ready'; coverage: CoverageManifest };

/** A covered function with its call count per feature index. */
interface FunctionRow {
  id: number;
  name: string;
  file: string;
  line: number;
  calls: Map<number, number>;
  total: number;
}

interface NodeBox { y: number; height: number; next: number }

export const palette = ['#00adee', '#ffbc01', '#99cf91', '#ff9980', '#c39bd3', '#5dd6c0', '#f5a3c7', '#d4c26a', '#8fb3ff', '#e0915a'];
const limits = [25, 50, 100, 250, 1000];
/** Height in px of one feature → function band. */
const band = 14;
const functionGap = 4;
const featureGap = 18;
const nodeWidth = 10;
const width = 1200;
const leftMargin = 280;
const rightMargin = 250;

const truncate = (text: string, max: number) => text.length > max ? `${text.slice(0, max - 1)}…` : text;
const shortFile = (file: string) => file.slice(file.lastIndexOf('/') + 1);
/** Reverses the report directory naming in setup/mcr.config.ts (`search__free-text` → `search/free-text.feature`). */
export const featureFile = (slug: string) => `${slug.replace(/__/g, '/')}.feature`;

/**
 * Two-column Sankey layout: features on the left, functions on the right, one band per pair.
 * Functions are ordered by the mean position of their features to reduce crossings.
 */
function layout(featureCount: number, rows: FunctionRow[]) {
  const ordered = [...rows].sort((a, b) => {
    const mean = (row: FunctionRow) => [...row.calls.keys()].reduce((sum, f) => sum + f, 0) / row.calls.size;
    return mean(a) - mean(b) || a.file.localeCompare(b.file) || a.line - b.line;
  });
  const featureBands = Array.from({ length: featureCount }, (_, feature) => rows.filter((row) => row.calls.has(feature)).length);
  const activeFeatures = featureBands.flatMap((count, feature) => count ? [feature] : []);
  const bandCount = featureBands.reduce((sum, count) => sum + count, 0);
  const leftHeight = bandCount * band + Math.max(0, activeFeatures.length - 1) * featureGap;
  const rightHeight = bandCount * band + Math.max(0, ordered.length - 1) * functionGap;
  const height = Math.max(leftHeight, rightHeight);

  const features = new Map<number, NodeBox>();
  let y = (height - leftHeight) / 2;
  for (const feature of activeFeatures) {
    const nodeHeight = featureBands[feature] * band;
    features.set(feature, { y, height: nodeHeight, next: y });
    y += nodeHeight + featureGap;
  }
  const functions = new Map<number, NodeBox>();
  y = (height - rightHeight) / 2;
  for (const row of ordered) {
    const nodeHeight = row.calls.size * band;
    functions.set(row.id, { y, height: nodeHeight, next: y });
    y += nodeHeight + functionGap;
  }
  // Stacking bands in target order within each feature, and source order within each function, avoids local crossings.
  const links = ordered.flatMap((row) => [...row.calls.keys()].sort((a, b) => a - b).map((feature) => {
    const source = features.get(feature)!;
    const target = functions.get(row.id)!;
    const link = { feature, row, y0: source.next + band / 2, y1: target.next + band / 2 };
    source.next += band;
    target.next += band;
    return link;
  }));
  return { height, features, functions, ordered, links };
}

function CoverageSankey({ coverage }: { coverage: CoverageManifest }) {
  const [feature, setFeature] = useState<number | 'all'>('all');
  const [scenario, setScenario] = useState<number | 'all'>('all');
  const [limit, setLimit] = useState(50);
  const [hideShared, setHideShared] = useState(true);
  const [focus, setFocus] = useState<{ kind: 'source' | 'fn'; id: number }>();
  const drill = feature !== 'all';

  // Left-hand nodes are features, or a feature's scenarios once drilled into; rows key calls by source position.
  const { sources, rows } = useMemo(() => {
    const sources = drill
      ? coverage.scenarios.flatMap((entry, id) => entry.feature === feature ? [{ id, name: entry.name }] : [])
      : coverage.features.map((entry, id) => ({ id, name: entry.name }));
    const position = new Map(sources.map(({ id }, index) => [id, index]));
    const links = drill
      ? coverage.scenarioLinks.map(({ scenario: source, fn, count }) => ({ source, fn, count }))
      : coverage.links.map(({ feature: source, fn, count }) => ({ source, fn, count }));
    const byId = new Map<number, FunctionRow>();
    for (const link of links) {
      const index = position.get(link.source);
      if (index === undefined) continue;
      let row = byId.get(link.fn);
      if (!row) byId.set(link.fn, row = { id: link.fn, ...coverage.functions[link.fn], calls: new Map(), total: 0 });
      row.calls.set(index, link.count);
      row.total += link.count;
    }
    const rows = [...byId.values()].sort((a, b) => b.calls.size - a.calls.size || b.total - a.total || a.file.localeCompare(b.file) || a.line - b.line);
    return { sources, rows };
  }, [coverage, drill, feature]);

  const selected = sources.findIndex(({ id }) => id === scenario);
  const sourceKind = drill ? 'scenario' : 'feature';
  const matching = rows.filter((row) => !(hideShared && sources.length > 1 && row.calls.size === sources.length)
    && (selected === -1 || row.calls.has(selected)));
  const shown = matching.slice(0, limit);
  const graph = layout(sources.length, shown);
  const x0 = leftMargin;
  const x1 = width - rightMargin;
  const middle = (x0 + x1) / 2;
  const isActive = (source: number, fn: number) => !focus || (focus.kind === 'source' ? focus.id === source : focus.id === fn);
  const focusProps = (kind: 'source' | 'fn', id: number) => ({
    tabIndex: 0,
    onMouseEnter: () => setFocus({ kind, id }), onMouseLeave: () => setFocus(undefined),
    onFocus: () => setFocus({ kind, id }), onBlur: () => setFocus(undefined),
  });
  const chooseFeature = (next: number | 'all') => {
    setFeature(next);
    setScenario('all');
    setFocus(undefined);
  };
  /** Clicking a feature drills into its scenarios; clicking a scenario toggles it as the filter. */
  const openSource = (index: number) => {
    const { id } = sources[index];
    if (drill) setScenario(scenario === id ? 'all' : id);
    else chooseFeature(id);
  };

  return <>
    <div className="coverage-tools">
      <label className="coverage-option">Feature
        <select id="coverage-feature" value={feature} onChange={(event) => chooseFeature(event.target.value === 'all' ? 'all' : Number(event.target.value))}>
          <option value="all">All feature files</option>
          {coverage.features.map(({ name, slug }, index) => <option key={slug} value={index}>{featureFile(slug)} · {name}</option>)}
        </select>
      </label>
      {drill && <label className="coverage-option">Scenario
        <select id="coverage-scenario" value={scenario} onChange={(event) => setScenario(event.target.value === 'all' ? 'all' : Number(event.target.value))}>
          <option value="all">All scenarios ({sources.length})</option>
          {sources.map(({ id, name }) => <option key={id} value={id}>{name}</option>)}
        </select>
      </label>}
      <label className="coverage-option">Show
        <select value={limit} onChange={(event) => setLimit(Number(event.target.value))}>
          {limits.map((value) => <option key={value} value={value}>{value}</option>)}
        </select>functions
      </label>
      <label className="coverage-option"><input type="checkbox" checked={hideShared} onChange={(event) => setHideShared(event.target.checked)} />Hide functions every {drill ? 'scenario in this feature' : 'feature'} calls</label>
      <span className="subtle">{shown.length} of {matching.length} matching · {rows.length} covered functions</span>
    </div>
    {shown.length ? <div className="sankey-scroll">
      <svg className="sankey" viewBox={`0 0 ${width} ${graph.height + 2}`} role="img" aria-label={`${drill ? 'Scenarios' : 'Features'} linked to the functions their tests execute`}>
        <g fill="none">{graph.links.map(({ feature: source, row, y0, y1 }) =>
          <path key={`${source}:${row.id}`} d={`M${x0},${y0}C${middle},${y0} ${middle},${y1} ${x1},${y1}`}
            stroke={palette[source % palette.length]} strokeWidth={band - 1}
            className={isActive(source, row.id) ? (focus ? 'band highlighted' : 'band') : 'band dimmed'}>
            <title>{`${sources[source].name} → ${row.name}: ${row.calls.get(source)} calls`}</title>
          </path>)}
        </g>
        {[...graph.features].map(([source, box]) => {
          const { name } = sources[source];
          return <g key={source} className={`sankey-node sankey-source${source === selected ? ' selected' : ''}`} {...focusProps('source', source)}
            onClick={() => openSource(source)} onKeyDown={(event) => { if (event.key === 'Enter') openSource(source); }}>
            <title>{`${name}\n${box.height / band} functions shown\n${drill ? (source === selected ? 'Click to show all scenarios' : 'Click to filter to this scenario') : 'Click to drill into its scenarios'}`}</title>
            <rect x={x0 - nodeWidth} y={box.y} width={nodeWidth} height={box.height} fill={palette[source % palette.length]} />
            <text x={x0 - nodeWidth - 8} y={box.y + box.height / 2} dy="0.35em" textAnchor="end" className="sankey-feature">{truncate(name, 42)}</text>
          </g>;
        })}
        {graph.ordered.map((row) => {
          const box = graph.functions.get(row.id)!;
          const location = `${shortFile(row.file)}:${row.line}`;
          return <g key={row.id} className="sankey-node" {...focusProps('fn', row.id)}>
            <title>{`${row.name}\n${row.file}:${row.line}\n${row.total} calls across ${row.calls.size} of ${sources.length} ${sourceKind}s`}</title>
            <rect x={x1} y={box.y} width={nodeWidth} height={box.height} />
            <text x={x1 + nodeWidth + 8} y={box.y + box.height / 2} dy="0.35em">
              {truncate(row.name, 30)}<tspan className="sankey-file" dx="8">{truncate(location, 34)}</tspan>
            </text>
          </g>;
        })}
      </svg>
    </div> : <div className="empty-state"><Search aria-hidden="true" /><h2>No matching functions</h2></div>}
  </>;
}

/**
 * Loads coverage.json, written by `npm run features:build` from the e2e coverage reports.
 * @returns The Sankey once loaded, or a loading, missing-data or retryable error state.
 */
export function CoveragePage() {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setState({ status: 'loading' });
    const load = async () => {
      try {
        const response = await fetch('coverage.json', { signal: controller.signal });
        if (response.status === 404) {
          if (!controller.signal.aborted) setState({ status: 'missing' });
          return;
        }
        if (!response.ok) throw new Error(`Coverage request failed (${response.status})`);
        const coverage: CoverageManifest = await response.json();
        if (!controller.signal.aborted) setState({ status: 'ready', coverage });
      } catch (error) {
        if (!controller.signal.aborted) setState({ status: 'error', message: error instanceof Error ? error.message : String(error) });
      }
    };
    void load();
    return () => controller.abort();
  }, [attempt]);

  return <main id="detail" className="coverage-page" tabIndex={-1}>
    <div className="section-heading"><h2>Function coverage by feature</h2>
      {state.status === 'ready' && <span className="subtle">{state.coverage.features.length} features with browser coverage</span>}
    </div>
    {state.status === 'ready' ? <CoverageSankey coverage={state.coverage} />
      : <div className="empty-state">{state.status === 'loading' ? <><LoaderCircle aria-hidden="true" /><h2>Loading coverage</h2></>
        : state.status === 'missing' ? <><Workflow aria-hidden="true" /><h2>No coverage data</h2><p>Run <code>npm test</code>, then rebuild the library with <code>npm run features:build</code>.</p></>
          : <><CircleAlert aria-hidden="true" /><h2>Coverage is unavailable</h2><p>{state.message}</p><button className="text-button" onClick={() => setAttempt((previous) => previous + 1)}>Retry</button></>}
      </div>}
  </main>;
}
