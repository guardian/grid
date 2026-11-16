/**
 * Code-first coverage view: every loaded source file, with each run block of code annotated on hover
 * with the features and scenarios that ran it (source-coverage.json).
 */
import { memo, useEffect, useMemo, useState } from 'react';
import { CircleAlert, FileCode2, LoaderCircle } from 'lucide-react';
import { featureFile, palette } from './coverage-page.tsx';
import { combine, isRun } from './source-page.tsx';
import type { CoverageManifest, SourceCoverage } from './types.ts';

type LoadState = { status: 'loading' } | { status: 'missing' } | { status: 'error'; message: string }
  | { status: 'ready'; coverage: CoverageManifest; sources: SourceCoverage };

/** Consecutive lines run by exactly the same scenarios. */
interface Block { start: number; end: number; features: number[]; scenarios: number[] }

const lineClass: Record<string, string> = { '+': 'run', '~': 'partial', '-': 'missed', '.': '' };

const fileAnchor = (file: number) => `file-${file}`;

/** One source file, rendered in full; hover state is local so hovering never re-renders other files. */
const FileCode = memo(function FileCode({ file, coverage, sources, states }: {
  file: number; coverage: CoverageManifest; sources: SourceCoverage; states: string;
}) {
  const [hover, setHover] = useState<{ block: number; top: number }>();
  const { path, source } = sources.files[file];
  const lines = useMemo(() => source.split('\n'), [source]);

  const { blocks, blockOf } = useMemo(() => {
    const runBy = (maps: Record<number, string>[]) => {
      const byLine: number[][] = lines.map(() => []);
      maps.forEach((map, id) => {
        const lineStates = map[file];
        if (lineStates) for (let i = 0; i < lines.length; i++) if (isRun(lineStates[i])) byLine[i].push(id);
      });
      return byLine;
    };
    const scenarioRuns = runBy(sources.scenarios);
    const featureRuns = runBy(sources.features);
    const found: Block[] = [];
    const index = new Int32Array(lines.length).fill(-1);
    for (let i = 0; i < lines.length; i++) {
      if (!featureRuns[i].length) continue;
      const signature = scenarioRuns[i].join(',');
      const last = found.at(-1);
      if (last && last.end === i - 1 && last.scenarios.join(',') === signature) last.end = i;
      else found.push({ start: i, end: i, features: featureRuns[i], scenarios: scenarioRuns[i] });
      index[i] = found.length - 1;
    }
    return { blocks: found, blockOf: index };
  }, [file, lines, sources]);

  const executable = [...states].filter((state) => state !== '.').length;
  const run = [...states].filter(isRun).length;
  const block = hover ? blocks[hover.block] : undefined;

  return <section className="files-file" id={fileAnchor(file)}>
    <header className="source-file-header files-file-header">
      <span className="source-file-path">{path}</span>
      <span className="source-counts"><span className="run">{executable ? Math.round((run / executable) * 100) : 0}%</span><span className="subtle">{run}/{executable} lines</span></span>
    </header>
    <div className="source-diff files-code" onMouseLeave={() => setHover(undefined)}>
      {lines.map((text, i) => {
        const state = states[i] ?? '.';
        const inBlock = hover !== undefined && blockOf[i] === hover.block;
        return <div key={i} className={`diff-line ${lineClass[state]}${inBlock ? ' in-block' : ''}`}
          onMouseEnter={(event) => {
            const target = blockOf[i];
            if (target === -1) setHover(undefined);
            else if (target !== hover?.block) {
              const first = event.currentTarget.parentElement?.children[blocks[target].start] as HTMLElement | undefined;
              setHover({ block: target, top: first?.offsetTop ?? event.currentTarget.offsetTop });
            }
          }}>
          <span className="diff-number">{i + 1}</span>
          <span className="files-heat" aria-hidden="true">
            {blockOf[i] !== -1 && blocks[blockOf[i]].features.map((feature) => <i key={feature} style={{ background: palette[feature % palette.length] }} />)}
          </span>
          <code>{text || ' '}</code>
        </div>;
      })}
      {block && hover && <div className="files-tooltip" style={{ top: hover.top }} role="tooltip">
        <strong>Lines {block.start + 1}{block.end > block.start ? `–${block.end + 1}` : ''}</strong>
        <span className="subtle">Run by {block.features.length} {block.features.length === 1 ? 'feature' : 'features'} · {block.scenarios.length} {block.scenarios.length === 1 ? 'scenario' : 'scenarios'}</span>
        <ul>{block.features.map((feature) => {
          const scenarios = block.scenarios.filter((id) => coverage.scenarios[id].feature === feature);
          const total = coverage.scenarios.filter((entry) => entry.feature === feature).length;
          return <li key={feature}>
            <span className="files-feature"><i style={{ background: palette[feature % palette.length] }} />{coverage.features[feature].name}<small>{featureFile(coverage.features[feature].slug)}</small></span>
            {scenarios.length > 0 && (scenarios.length === total && total > 1
              ? <ul><li>All {total} scenarios</li></ul>
              : <ul>{scenarios.map((id) => <li key={id}>{coverage.scenarios[id].name}</li>)}</ul>)}
          </li>;
        })}</ul>
      </div>}
    </div>
  </section>;
});

function FilesView({ coverage, sources }: { coverage: CoverageManifest; sources: SourceCoverage }) {
  const [filter, setFilter] = useState('');
  const [onlyRun, setOnlyRun] = useState(false);
  const combined = useMemo(() => combine(sources.features), [sources]);
  const files = useMemo(() => sources.files.map((entry, file) => {
    // Files no test ran have no line states; mark every line unknown rather than inventing executable lines.
    const states = combined[file] ?? '.'.repeat(entry.source.split('\n').length);
    const executable = [...states].filter((state) => state !== '.').length;
    const run = [...states].filter(isRun).length;
    return { file, path: entry.path, states, run, pct: executable ? run / executable : 0 };
  }).sort((a, b) => a.path.localeCompare(b.path)), [sources, combined]);
  const words = filter.toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const shown = files.filter(({ path, run }) => (!onlyRun || run > 0) && words.every((word) => path.toLocaleLowerCase().includes(word)));

  return <div className="files-layout">
    <nav className="files-list" aria-label="Source files">
      <label className="search"><FileCode2 aria-hidden="true" /><input type="search" placeholder="Filter files..." aria-label="Filter files" autoComplete="off" value={filter} onChange={(event) => setFilter(event.target.value)} /></label>
      <label className="coverage-option"><input type="checkbox" checked={onlyRun} onChange={(event) => setOnlyRun(event.target.checked)} />Only files a test ran</label>
      <span className="subtle">{shown.length} of {files.length} files</span>
      <ul>{shown.map(({ file, path, pct, run }) => <li key={file}>
        <a href={`#files/${file}`} onClick={(event) => {
          event.preventDefault();
          document.getElementById(fileAnchor(file))?.scrollIntoView({ block: 'start' });
        }} title={path}>
          <span className="files-list-path">{path.replace(/^public\/js\//, '')}</span>
          <span className={`files-list-pct${run ? '' : ' none'}`}>{Math.round(pct * 100)}%</span>
          <span className="files-list-bar"><span style={{ width: `${pct * 100}%` }} /></span>
        </a>
      </li>)}</ul>
    </nav>
    <div className="files-main">
      {shown.map(({ file, states }) => <FileCode key={file} file={file} coverage={coverage} sources={sources} states={states} />)}
    </div>
  </div>;
}

/**
 * Loads coverage.json and source-coverage.json from `npm run features:build`.
 * @returns The file browser once loaded, or a loading, missing-data or retryable error state.
 */
export function FilesPage() {
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

  return <main id="detail" className="coverage-page files-page" tabIndex={-1}>
    <div className="section-heading"><h2>Code files</h2>
      <span className="subtle">Hover over highlighted code to see which features and scenarios ran it</span>
    </div>
    {state.status === 'ready' ? <FilesView coverage={state.coverage} sources={state.sources} />
      : <div className="empty-state">{state.status === 'loading' ? <><LoaderCircle aria-hidden="true" /><h2>Loading code files</h2></>
        : state.status === 'missing' ? <><FileCode2 aria-hidden="true" /><h2>No coverage data</h2><p>Run <code>npm test</code>, then rebuild the library with <code>npm run features:build</code>.</p></>
          : <><CircleAlert aria-hidden="true" /><h2>Code files are unavailable</h2><p>{state.message}</p><button className="text-button" onClick={() => setAttempt((previous) => previous + 1)}>Retry</button></>}
      </div>}
  </main>;
}
