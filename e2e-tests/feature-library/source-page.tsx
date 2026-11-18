/**
 * Side-by-side, diff-style source viewer: the selected feature's scenarios on the left, the source lines they ran
 * (source-coverage.json) on the right, joined by connector ribbons like an IDE diff view.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, CircleAlert, FileCode2, LoaderCircle } from 'lucide-react';
import { featureFile, palette } from './scenario-list.tsx';
import { ScenarioList } from './scenario-list.tsx';
import type { Selection } from './scenario-list.tsx';
import type { CoverageManifest, LibraryManifest, SourceCoverage, Step } from './types.ts';

type LoadState = { status: 'loading' } | { status: 'missing' } | { status: 'error'; message: string }
  | { status: 'ready'; coverage: CoverageManifest; sources: SourceCoverage };

/** Line states from SourceCoverage, strongest first, so combining reports keeps the best result per line. */
const strength = '+~-.';
/** 's' marks lines every feature ran, shown muted and ignored when building hunks. */
const markers: Record<string, string> = { '+': '+', '~': '~', '-': '-', '.': ' ', s: '·' };
const lineClass: Record<string, string> = { '+': 'run', '~': 'partial', '-': 'missed', '.': '', s: 'shared' };
const contextOptions = [[3, '3 lines of context'], [10, '10 lines of context'], [Infinity, 'Whole files']] as const;
export const isRun = (state: string | undefined) => state === '+' || state === '~';

interface Hunk { start: number; end: number; name?: string; blocks: number[] }
/** A left-hand item (a feature or scenario) that connector ribbons start from. */
interface Block { title: string; subtitle?: string; steps: Step[]; states: Record<number, string>; selection: Selection }

/** Merges per-file line states across reports, keeping the strongest state for each line. */
export function combine(maps: Record<number, string>[]): Record<number, string> {
  const merged: Record<number, string> = {};
  for (const map of maps) {
    for (const [file, states] of Object.entries(map)) {
      const current = merged[Number(file)];
      merged[Number(file)] = current
        ? [...states].map((state, i) => strength.indexOf(state) < strength.indexOf(current[i]) ? state : current[i]).join('')
        : states;
    }
  }
  return merged;
}

/** Zero-based line ranges around run lines, padded by `context` and merged where they touch, like diff hunks. */
function hunks(states: string, context: number, functions: { name: string; line: number }[]): Omit<Hunk, 'blocks'>[] {
  const ranges: Omit<Hunk, 'blocks'>[] = [];
  for (let i = 0; i < states.length; i++) {
    if (!isRun(states[i])) continue;
    const start = Math.max(0, i - context);
    const end = Math.min(states.length - 1, i + context);
    const last = ranges[ranges.length - 1];
    if (last && start <= last.end + 1) last.end = Math.max(last.end, end);
    else ranges.push({ start, end });
  }
  // Label each hunk with the nearest run function starting at or above its first run line, as `git diff` does.
  for (const range of ranges) {
    const firstRun = states.slice(range.start).search(/[+~]/) + range.start + 1;
    range.name = functions.filter((fn) => fn.line <= firstRun).at(-1)?.name;
  }
  return ranges;
}

function SourceFile({ path, source, states, fileHunks, open, onToggle, hunkRef, onHover }: {
  path: string; source: string; states: string; fileHunks: Hunk[]; open: boolean; onToggle: () => void;
  hunkRef: (start: number) => (element: HTMLElement | null) => void; onHover: (start?: number) => void;
}) {
  const counts = { '+': 0, '~': 0, '-': 0 } as Record<string, number>;
  for (const state of states) if (state in counts) counts[state]++;
  const lines = open ? source.split('\n') : [];
  return <section className="source-file">
    <button type="button" className="source-file-header" aria-expanded={open} onClick={onToggle}>
      <ChevronDown aria-hidden="true" className="source-file-chevron" />
      <span className="source-file-path">{path}</span>
      <span className="source-counts">
        <span className="run" title="Lines run">+{counts['+']}</span>
        {counts['~'] > 0 && <span className="partial" title="Lines partly run (some branches)">~{counts['~']}</span>}
        <span className="missed" title="Executable lines not run">−{counts['-']}</span>
      </span>
    </button>
    {open && <div className="source-diff" role="table" aria-label={`Coverage of ${path}`}>
      {fileHunks.map((hunk) => <div key={hunk.start} role="rowgroup" ref={hunkRef(hunk.start)} className="diff-group"
        onMouseEnter={() => onHover(hunk.start)} onMouseLeave={() => onHover(undefined)}>
        <div className="diff-hunk" role="row">@@ {hunk.start + 1}–{hunk.end + 1} @@ {hunk.name}</div>
        {lines.slice(hunk.start, hunk.end + 1).map((text, offset) => {
          const index = hunk.start + offset;
          const state = states[index] ?? '.';
          return <div key={index} className={`diff-line ${lineClass[state]}`} role="row">
            <span className="diff-number" role="cell">{index + 1}</span>
            <span className="diff-marker" role="cell">{markers[state]}</span>
            <code role="cell">{text || ' '}</code>
          </div>;
        })}
      </div>)}
    </div>}
  </section>;
}

function SourceView({ coverage, sources, library }: { coverage: CoverageManifest; sources: SourceCoverage; library: LibraryManifest }) {
  const [selected, setSelected] = useState<Selection>({ feature: 'all', scenario: 'all' });
  const [preview, setPreview] = useState<Selection>();
  const [context, setContext] = useState<number>(3);
  const [filter, setFilter] = useState('');
  const [hideShared, setHideShared] = useState(true);
  /** Fraction of a scenario's sibling scenarios that must also run a line for it to be hidden. */
  const [siblingShare, setSiblingShare] = useState(0.5);
  const [closed, setClosed] = useState(new Set<string>());
  const shown = preview ?? selected;

  /** Per file, the lines every report in `maps` ran (1 = shared); empty with fewer than two reports. */
  const sharedBy = (maps: Record<number, string>[]) => {
    const masks = new Map<number, Uint8Array>();
    if (maps.length < 2) return masks;
    for (const [file, states] of Object.entries(maps[0])) {
      const mask = new Uint8Array(states.length);
      for (let i = 0; i < states.length; i++) if (maps.every((map) => isRun(map[Number(file)]?.[i]))) mask[i] = 1;
      if (mask.includes(1)) masks.set(Number(file), mask);
    }
    return masks;
  };
  const sharedLines = useMemo(() => sharedBy(sources.features), [sources]);
  // A shown scenario also hides code enough of its feature's other scenarios run, leaving what sets it apart.
  const scenarioFeature = shown.scenario === 'all' ? undefined : coverage.scenarios[shown.scenario].feature;
  const siblingLines = useMemo(() => {
    const masks = new Map<number, Uint8Array>();
    if (shown.scenario === 'all') return masks;
    const siblings = coverage.scenarios.flatMap((entry, id) => entry.feature === scenarioFeature && id !== shown.scenario ? [sources.scenarios[id] ?? {}] : []);
    if (!siblings.length) return masks;
    for (const [file, states] of Object.entries(sources.scenarios[shown.scenario] ?? {})) {
      const mask = new Uint8Array(states.length);
      for (let i = 0; i < states.length; i++) {
        if (isRun(states[i]) && siblings.filter((map) => isRun(map[Number(file)]?.[i])).length / siblings.length >= siblingShare) mask[i] = 1;
      }
      if (mask.includes(1)) masks.set(Number(file), mask);
    }
    return masks;
  }, [coverage, sources, shown.scenario, scenarioFeature, siblingShare]);
  const mask = (file: number, states: string) => {
    const masks = hideShared ? [sharedLines.get(file), siblingLines.get(file)].filter((entry) => entry !== undefined) : [];
    return masks.length ? [...states].map((state, i) => isRun(state) && masks.some((shared) => shared[i]) ? 's' : state).join('') : states;
  };

  const blocks = useMemo((): Block[] => {
    const stepsFor = (feature: number, name: string) => {
      const source = library.features.find((entry) => entry.name === coverage.features[feature].name);
      // Outline examples are reported as "<outline> › <example>", so match on the outline's name.
      return source?.scenarios.find((entry) => name === entry.name || name.startsWith(`${entry.name} › `))?.steps ?? [];
    };
    const scenarioBlock = (id: number): Block => ({
      title: coverage.scenarios[id].name, steps: stepsFor(coverage.scenarios[id].feature, coverage.scenarios[id].name),
      states: sources.scenarios[id] ?? {}, selection: { feature: coverage.scenarios[id].feature, scenario: id },
    });
    // A selected scenario keeps its feature's other scenarios in the pane so you can switch between them.
    const feature = shown.scenario !== 'all' ? coverage.scenarios[shown.scenario].feature : shown.feature;
    if (feature !== 'all') return coverage.scenarios.flatMap((entry, id) => entry.feature === feature ? [scenarioBlock(id)] : []);
    return coverage.features.map((entry, id) => ({
      title: entry.name, subtitle: featureFile(entry.slug), steps: [], states: sources.features[id] ?? {}, selection: { feature: id, scenario: 'all' },
    }));
  }, [coverage, sources, library, shown.feature, shown.scenario]);
  /** The card whose code is shown; other cards in the pane don't draw ribbons. */
  const activeBlock = shown.scenario === 'all' ? undefined : blocks.findIndex((block) => block.selection.scenario === shown.scenario);

  const functionsByFile = useMemo(() => {
    const byFile = new Map<string, { name: string; line: number }[]>();
    for (const fn of coverage.functions) byFile.set(fn.file, [...(byFile.get(fn.file) ?? []), fn]);
    for (const list of byFile.values()) list.sort((a, b) => a.line - b.line);
    return byFile;
  }, [coverage]);
  const files = useMemo(() => {
    const lineMap = shown.scenario !== 'all' ? sources.scenarios[shown.scenario] ?? {}
      : shown.feature !== 'all' ? sources.features[shown.feature] ?? {} : combine(sources.features);
    const words = filter.toLocaleLowerCase().split(/\s+/).filter(Boolean);
    return Object.entries(lineMap)
      .map(([key, raw]) => {
        const file = Number(key);
        const states = mask(file, raw);
        const { path, source } = sources.files[file];
        const blockStates = blocks.map((block, index) => (activeBlock === undefined || activeBlock === index) && block.states[file] ? mask(file, block.states[file]) : undefined);
        const fileHunks = hunks(states, context, functionsByFile.get(path) ?? []).map((hunk) => ({
          ...hunk,
          blocks: blockStates.flatMap((block, index) => block && /[+~]/.test(block.slice(hunk.start, hunk.end + 1)) ? [index] : []),
        }));
        return { file, path, source, states, fileHunks };
      })
      .filter(({ path, fileHunks }) => fileHunks.length > 0 && words.every((word) => path.toLocaleLowerCase().includes(word)))
      .sort((a, b) => a.path.localeCompare(b.path));
  }, [sources, shown.feature, shown.scenario, filter, context, hideShared, sharedLines, siblingLines, blocks, activeBlock, functionsByFile]);
  const runLines = files.reduce((sum, { states }) => sum + (states.match(/[+~]/g)?.length ?? 0), 0);
  const title = shown.scenario !== 'all' ? coverage.scenarios[shown.scenario].name
    : shown.feature !== 'all' ? coverage.features[shown.feature].name : 'All features';

  // Connectors are drawn imperatively from measured positions, so scrolling never re-renders the source.
  const svgRef = useRef<SVGSVGElement>(null);
  const gherkinRef = useRef<HTMLDivElement>(null);
  const blockElements = useRef(new Map<number, HTMLElement>());
  const hunkElements = useRef(new Map<string, HTMLElement>());
  const hovered = useRef<string>(undefined);
  const links = files.flatMap(({ file, path, fileHunks }) => closed.has(path) ? []
    : fileHunks.flatMap((hunk) => hunk.blocks.map((block) => ({ block, hunk: `${file}:${hunk.start}` }))));
  const redraw = useRef(() => {});
  redraw.current = () => {
    const svg = svgRef.current;
    if (!svg) return;
    const box = svg.getBoundingClientRect();
    const middle = box.width / 2;
    const clamp = (value: number) => Math.min(box.height, Math.max(0, value));
    const paths = links.flatMap(({ block, hunk }) => {
      const from = blockElements.current.get(block)?.getBoundingClientRect();
      const to = hunkElements.current.get(hunk)?.getBoundingClientRect();
      if (!from || !to || to.bottom < box.top || to.top > box.bottom) return [];
      const centre = clamp((from.top + from.bottom) / 2 - box.top);
      const half = Math.min(7, from.height / 2);
      const [a1, a2, b1, b2] = [centre - half, centre + half, to.top - box.top, to.bottom - box.top];
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', `M0,${a1}C${middle},${a1} ${middle},${b1} ${box.width},${b1}L${box.width},${b2}C${middle},${b2} ${middle},${a2} 0,${a2}Z`);
      const active = hovered.current === `b:${block}` || hovered.current === `h:${hunk}`;
      path.setAttribute('fill', palette[block % palette.length]);
      path.setAttribute('fill-opacity', String(active ? 0.55 : hovered.current ? 0.05 : 0.22));
      path.setAttribute('stroke', palette[block % palette.length]);
      path.setAttribute('stroke-opacity', String(active ? 0.9 : hovered.current ? 0.08 : 0.35));
      return [path];
    });
    svg.replaceChildren(...paths);
  };
  useLayoutEffect(() => redraw.current());
  useEffect(() => {
    let frame = 0;
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => redraw.current());
    };
    const gherkin = gherkinRef.current;
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    gherkin?.addEventListener('scroll', schedule, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      gherkin?.removeEventListener('scroll', schedule);
    };
  }, []);
  const hover = (key?: string) => {
    hovered.current = key;
    redraw.current();
  };
  useEffect(() => {
    if (selected.scenario === 'all') return;
    const index = blocks.findIndex((block) => block.selection.scenario === selected.scenario);
    blockElements.current.get(index)?.scrollIntoView({ block: 'nearest' });
  }, [selected.scenario]);

  return <div className="source-layout">
    <ScenarioList coverage={coverage} selected={selected} onSelect={setSelected} onPreview={setPreview} className="source-scenarios" />
    <div className="source-gherkin" ref={gherkinRef} aria-label="Selected feature">
      {blocks.map((block, index) => {
        const isSelected = selected.scenario !== 'all' && block.selection.scenario === selected.scenario;
        const isScenario = block.selection.scenario !== 'all';
        return <button type="button" key={`${block.title}:${index}`}
          className={`gherkin-block${activeBlock !== undefined && activeBlock !== index ? ' inactive' : ''}`}
          aria-pressed={isSelected}
          title={isScenario ? (isSelected ? 'Click to show the whole feature' : 'Click to show only this scenario\'s code') : 'Click to open this feature'}
          style={{ borderLeftColor: palette[index % palette.length] }}
          ref={(element) => { if (element) blockElements.current.set(index, element); else blockElements.current.delete(index); }}
          // Hovering a scenario previews its code; feature cards don't, as that would swap the cards under the pointer.
          onMouseEnter={() => { hover(`b:${index}`); if (isScenario) setPreview(block.selection); }}
          onMouseLeave={() => { hover(undefined); setPreview(undefined); }}
          onClick={() => setSelected(isSelected ? { feature: block.selection.feature, scenario: 'all' } : block.selection)}>
          <strong>{block.title}</strong>
          {block.subtitle && <small>{block.subtitle}</small>}
          {block.steps.length > 0 && <ol>{block.steps.map((step, i) => <li key={i}><span className="step-keyword">{step.keyword.trim()}</span> {step.text}</li>)}</ol>}
        </button>;
      })}
    </div>
    <svg className="source-connectors" ref={svgRef} aria-hidden="true" />
    <div className="source-main">
      <div className="coverage-tools">
        <label className="search"><FileCode2 aria-hidden="true" /><input type="search" placeholder="Filter files..." aria-label="Filter files" autoComplete="off" value={filter} onChange={(event) => setFilter(event.target.value)} /></label>
        <select aria-label="Context" value={context} onChange={(event) => setContext(Number(event.target.value))}>
          {contextOptions.map(([value, label]) => <option key={label} value={value}>{label}</option>)}
        </select>
        <label className="coverage-option" title="Greys out lines every feature runs">
          <input type="checkbox" checked={hideShared} onChange={(event) => setHideShared(event.target.checked)} />
          Hide shared code
        </label>
        {hideShared && scenarioFeature !== undefined && <label className="coverage-option" title="Also greys out this scenario's lines that at least this share of the feature's other scenarios run">
          Also hide code ≥
          <input type="range" min={0.05} max={1} step={0.05} value={siblingShare} onChange={(event) => setSiblingShare(Number(event.target.value))} />
          {Math.round(siblingShare * 100)}% of other scenarios in this feature run
        </label>}
        <button type="button" className="text-button" onClick={() => setClosed(new Set())}>Expand all</button>
        <button type="button" className="text-button" onClick={() => setClosed(new Set(files.map(({ path }) => path)))}>Collapse all</button>
      </div>
      <div className="source-summary"><strong>{title}</strong><span className="subtle">{files.length} files · {runLines} lines run</span></div>
      {files.length === 0 && <div className="empty-state"><FileCode2 aria-hidden="true" /><h2>No code left to show</h2>
        <p>Everything this ran is shared{scenarioFeature !== undefined ? ' with other scenarios in the feature; lower the threshold to see it' : ''}.</p></div>}
      {files.map(({ file, path, source, states, fileHunks }) => <SourceFile key={path} path={path} source={source} states={states} fileHunks={fileHunks}
        open={!closed.has(path)}
        onToggle={() => setClosed((previous) => {
          const next = new Set(previous);
          if (!next.delete(path)) next.add(path);
          return next;
        })}
        hunkRef={(start) => (element) => {
          if (element) hunkElements.current.set(`${file}:${start}`, element);
          else hunkElements.current.delete(`${file}:${start}`);
        }}
        onHover={(start) => hover(start === undefined ? undefined : `h:${file}:${start}`)} />)}
    </div>
  </div>;
}

/**
 * Loads coverage.json and source-coverage.json from `npm run features:build`.
 * @param library - The loaded library manifest, used to show each scenario's Gherkin steps.
 * @returns The source viewer once loaded, or a loading, missing-data or retryable error state.
 */
export function SourcePage({ library }: { library: LibraryManifest }) {
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
        const [coverage, sources] = await Promise.all([fetchJson<CoverageManifest>('coverage.json'), fetchJson<SourceCoverage>('source-coverage.json')]);
        if (controller.signal.aborted) return;
        setState(coverage && sources ? { status: 'ready', coverage, sources } : { status: 'missing' });
      } catch (error) {
        if (!controller.signal.aborted) setState({ status: 'error', message: error instanceof Error ? error.message : String(error) });
      }
    };
    void load();
    return () => controller.abort();
  }, [attempt]);

  return <main id="detail" className="coverage-page source-page" tabIndex={-1}>
    <div className="section-heading"><h2>Source coverage</h2>
      <span className="subtle source-legend"><span className="run">+ run</span><span className="partial">~ partly run</span><span className="missed">− not run</span><span className="shared-legend">· shared (hidden)</span></span>
    </div>
    {state.status === 'ready' ? <SourceView coverage={state.coverage} sources={state.sources} library={library} />
      : <div className="empty-state">{state.status === 'loading' ? <><LoaderCircle aria-hidden="true" /><h2>Loading source coverage</h2></>
        : state.status === 'missing' ? <><FileCode2 aria-hidden="true" /><h2>No coverage data</h2><p>Run <code>npm test</code>, then rebuild the library with <code>npm run features:build</code>.</p></>
          : <><CircleAlert aria-hidden="true" /><h2>Source coverage is unavailable</h2><p>{state.message}</p><button className="text-button" onClick={() => setAttempt((previous) => previous + 1)}>Retry</button></>}
      </div>}
  </main>;
}
