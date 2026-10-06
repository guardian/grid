/**
 * Static React viewer for library.json. App loads the snapshot; FeatureLibrary owns
 * filtering and selection, while the leaf components render definitions and media.
 * Navigation uses scenario IDs in URL fragments rather than a routing framework.
 */
import { StrictMode, useEffect, useEffectEvent, useLayoutEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  ArrowLeft, ArrowRight, CalendarClock, Check, ChevronDown, Circle, CircleAlert,
  CircleHelp, Clapperboard, Download, FileCode2, FolderOpen, GitBranch,
  Link as LinkIcon, ListChecks, ListFilter, LoaderCircle, Minus,
  RotateCcw, Search, SearchX, SkipForward, Video, VideoOff, X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { Feature, LibraryManifest, Recording, Run, RunStatus, Scenario, ScenarioStatus, Step } from './types.ts';

/** A scenario paired with its parent feature and lowercased searchable text. */
interface Entry {
  feature: Feature;
  scenario: Scenario;
  searchText: string;
}

/** Controlled filter values; feature/status use "all" to disable that constraint. */
interface Filters {
  query: string;
  feature: string;
  status: string;
}

/** An available recording with a required URL and its parent attempt for display labels. */
interface PlayableRecording extends Recording {
  src: string;
  run: Run;
  index: number;
}

/** The loader exposes a manifest only after a successful response, or a retryable error. */
type LoadState = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; library: LibraryManifest };

const labels: Record<ScenarioStatus | RunStatus, string> = {
  passed: 'Passed', failed: 'Failed', flaky: 'Flaky', planned: 'Planned',
  'not-run': 'Not run', skipped: 'Skipped', unmatched: 'Unmatched',
  timedOut: 'Timed out', interrupted: 'Interrupted', unknown: 'Unknown',
};
const statusIcons: Record<ScenarioStatus, LucideIcon> = {
  passed: Check, failed: X, flaky: RotateCcw, planned: Minus,
  'not-run': Circle, skipped: SkipForward, unmatched: CircleHelp,
};
const defaultFilters: Filters = { query: '', feature: 'all', status: 'all' };
const statusOptions = [
  ['all', 'All statuses'], ['recorded', 'With video'], ['failed', 'Failed'],
  ['passed', 'Passed'], ['flaky', 'Flaky'], ['planned', 'Planned'],
  ['unrecorded', 'No video'], ['not-run', 'Not run'], ['skipped', 'Skipped'], ['unmatched', 'Unmatched'],
];

/**
 * @param scenario - A manifest scenario containing attempts and optional recordings.
 * @returns Available videos with URLs, attempt metadata and their index within that
 * attempt's recordings. The original attempt/attachment ordering is preserved.
 */
function recordingsFor(scenario: Scenario): PlayableRecording[] {
  return scenario.runs.flatMap((run) => run.recordings.flatMap((recording, index) =>
    recording.available && recording.src ? [{ ...recording, src: recording.src, run, index }] : []));
}

/**
 * @param milliseconds - Optional reported duration, not the video's decoded length.
 * @returns Rounded milliseconds below one second, seconds to one decimal otherwise,
 * or an empty string when no timing is available.
 */
function duration(milliseconds?: number): string {
  if (milliseconds == null) return '';
  return milliseconds < 1000 ? `${Math.round(milliseconds)} ms` : `${(milliseconds / 1000).toFixed(1)} s`;
}

/**
 * @param entries - Catalogue entries with precomputed lowercase search text.
 * @param filters - Search query, feature ID and status/video-availability selection.
 * @returns Entries satisfying every constraint in their original order. Every
 * whitespace-separated query word must occur somewhere in the entry's search text.
 */
function filterEntries(entries: Entry[], filters: Filters): Entry[] {
  const words = filters.query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  return entries.filter(({ feature, scenario, searchText }) =>
    (filters.feature === 'all' || feature.id === filters.feature)
    && (filters.status === 'all' || (filters.status === 'recorded' ? recordingsFor(scenario).length > 0
      : filters.status === 'unrecorded' ? recordingsFor(scenario).length === 0 : scenario.status === filters.status))
    && words.every((word) => searchText.includes(word)));
}

/**
 * @param id - Scenario ID to write to the URL fragment.
 * @param replace - Replace the current history entry instead of adding a navigation step.
 * @returns Nothing; updates browser history only when the fragment differs.
 * pushState/replaceState do not emit hashchange, so callers also update React selection.
 */
function setHash(id: string, replace = false): void {
  if (location.hash.slice(1) !== id) history[replace ? 'replaceState' : 'pushState'](null, '', `#${id}`);
}

/**
 * Renders the shared masthead and snapshot totals without changing application state.
 * Inputs are an optional library and a loading flag; absent data displays zero totals.
 * @returns Header JSX. "With video" counts scenarios with media, not individual clips.
 */
function PageHeader({ library, loading = false }: { library?: LibraryManifest; loading?: boolean }) {
  const entries = library?.features.flatMap((feature) => feature.scenarios) ?? [];
  const videoCount = entries.filter((scenario) => recordingsFor(scenario).length > 0).length;
  const reportDate = library?.report ? new Date(library.report.startedAt) : undefined;
  return <>
    <a className="skip-link" href="#detail">Skip to scenario</a>
    <header className="masthead">
      <a href="./" className="brand" aria-label="Grid feature library" title="Grid feature library"><img src="grid-logo.svg" width="32" height="32" alt="" /></a>
      <span className="masthead-divider" /><span className="masthead-label">Feature library</span>
      <span className="snapshot"><span className="snapshot-dot" /><span id="report-date" title={reportDate?.toLocaleString()}>
        {loading ? 'Loading snapshot' : reportDate ? `Run ${reportDate.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}` : library ? 'No test report' : 'Unavailable'}
      </span></span>
    </header>
    <section className="intro" aria-labelledby="page-title">
      <div><div className="eyebrow">THE GRID / BEHAVIOUR CATALOGUE</div><h1 id="page-title">Feature library</h1></div>
      <div className="totals" id="totals" aria-label="Library totals">
        {[[library?.features.length ?? 0, 'Features'], [entries.length, 'Scenarios'], [videoCount, 'With video']].map(([count, label]) =>
          <div className="total" key={label}><strong>{String(count).padStart(2, '0')}</strong><span>{label}</span></div>)}
      </div>
    </section>
  </>;
}

/**
 * Renders controlled filters and the already-filtered scenario list.
 * Inputs: all features for the selector, visible entries, filter values, selected ID,
 * and callbacks receiving replacement filters or the chosen Entry.
 * @returns Sidebar JSX; selection stays visible by scrolling the list, not the page.
 */
function Catalogue({ features, visible, filters, selectedId, onFiltersChange, onSelect }: {
  features: Feature[];
  visible: Entry[];
  filters: Filters;
  selectedId?: string;
  onFiltersChange: (filters: Filters) => void;
  onSelect: (entry: Entry) => void;
}) {
  const listRef = useRef<HTMLElement>(null);
  /**
   * Takes no arguments and reads the current list ref/selection after layout or resize.
   * Returns nothing; centres the mobile item horizontally or reveals it vertically on desktop.
   */
  const revealSelection = useEffectEvent(() => {
    const list = listRef.current;
    const selected = list?.querySelector<HTMLElement>('[aria-current="true"]');
    if (!list || !selected) return;
    const selectedBounds = selected.getBoundingClientRect();
    const listBounds = list.getBoundingClientRect();
    if (matchMedia('(max-width: 760px)').matches) {
      list.scrollLeft += selectedBounds.left - listBounds.left - (list.clientWidth - selectedBounds.width) / 2;
    } else if (selectedBounds.top < listBounds.top) {
      list.scrollTop += selectedBounds.top - listBounds.top;
    } else if (selectedBounds.bottom > listBounds.bottom) {
      list.scrollTop += selectedBounds.bottom - listBounds.bottom;
    }
  });
  useLayoutEffect(() => { revealSelection(); }, [selectedId, visible]);
  useEffect(() => {
    const media = matchMedia('(max-width: 760px)');
    const listener = () => revealSelection();
    media.addEventListener('change', listener);
    return () => media.removeEventListener('change', listener);
  }, []);

  return <aside className="catalogue" aria-label="Scenario catalogue">
    <div className="catalogue-tools">
      <label className="search"><Search aria-hidden="true" /><input id="search" type="search" placeholder="Search scenarios..." aria-label="Search scenarios" autoComplete="off" value={filters.query} onChange={(event) => onFiltersChange({ ...filters, query: event.target.value })} /></label>
      <label className="field-label" htmlFor="feature-filter">FEATURE</label>
      <select id="feature-filter" aria-label="Filter by feature" value={filters.feature} onChange={(event) => onFiltersChange({ ...filters, feature: event.target.value })}>
        <option value="all">All features</option>{features.map((feature) => <option value={feature.id} key={feature.id}>{feature.name}</option>)}
      </select>
      <div className="filter-heading"><span className="field-label">SCENARIOS <span id="result-count">{visible.length}</span></span><label className="sr-only" htmlFor="status-filter">Filter by status</label>
        <select id="status-filter" value={filters.status} onChange={(event) => onFiltersChange({ ...filters, status: event.target.value })}>
          {statusOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </div>
    </div>
    <nav id="scenario-list" ref={listRef} aria-label="Scenarios">
      {visible.length ? visible.map((entry) => {
        const { feature, scenario } = entry;
        const StatusIcon = statusIcons[scenario.status];
        return <a className={`scenario-item ${scenario.id === selectedId ? 'selected' : ''}`} href={`#${scenario.id}`} key={scenario.id} aria-current={scenario.id === selectedId ? 'true' : undefined} onClick={(event) => {
          if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
          event.preventDefault();
          onSelect(entry);
        }}>
          <span className={`status-mark ${scenario.status}`} aria-label={labels[scenario.status]}><StatusIcon aria-hidden="true" /></span>
          <span className="scenario-item-copy"><span className="scenario-name">{scenario.name}</span><span className="scenario-meta">{feature.name}
            {recordingsFor(scenario).length > 0 && <span className="video-marker" title="Video available"><Video aria-hidden="true" /><span className="sr-only">Video available</span></span>}
          </span></span>
        </a>;
      }) : <div className="list-empty"><SearchX aria-hidden="true" /><h3>No matching scenarios</h3><button id="clear-filters" className="text-button" onClick={() => onFiltersChange(defaultFilters)}>Clear filters</button></div>}
    </nav>
    <div className="catalogue-footer"><GitBranch aria-hidden="true" /><span>From the Gherkin specifications</span></div>
  </aside>;
}

/**
 * Inputs are optional column headings and rows of plain cell text.
 * @returns A horizontally scrollable table; React escapes all headings and values.
 */
function DataTable({ headers = [], rows }: { headers?: string[]; rows: string[][] }) {
  return <div className="table-scroll"><table>
    {headers.length > 0 && <thead><tr>{headers.map((cell, index) => <th key={index} scope="col">{cell}</th>)}</tr></thead>}
    <tbody>{rows.map((row, index) => <tr key={index}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}</tr>)}</tbody>
  </table></div>;
}

/**
 * Input is an ordered list of background or scenario steps from the manifest.
 * @returns Given/When/Then rows, including any data tables and literal doc strings.
 */
function Steps({ steps }: { steps: Step[] }) {
  return <ol className="steps">{steps.map((step, index) => <li key={index}>
    <span className="step-keyword">{step.keyword}</span><div><span>{step.text}</span>
      {step.table && <DataTable rows={step.table} />}{step.docString !== undefined && <pre>{step.docString}</pre>}
    </div>
  </li>)}</ol>;
}

/**
 * Input is a scenario-level status, including viewer-only states such as planned.
 * @returns A badge with a readable label, icon and status-specific CSS class.
 */
function StatusBadge({ status }: { status: ScenarioStatus }) {
  const StatusIcon = statusIcons[status];
  return <span className={`badge ${status}`}><StatusIcon aria-hidden="true" />{labels[status]}</span>;
}

/**
 * Inputs are the owning scenario and a non-empty list from recordingsFor.
 * @returns Native video playback plus attempt, speed and download controls.
 * The final supplied recording is selected initially; local state belongs to the
 * keyed ScenarioDetail instance and resets when the user selects another scenario.
 */
function RecordingPlayer({ scenario, recordings }: { scenario: Scenario; recordings: PlayableRecording[] }) {
  const [recordingIndex, setRecordingIndex] = useState(recordings.length - 1);
  const [speed, setSpeed] = useState(1);
  const [failed, setFailed] = useState(false);
  const playerRef = useRef<HTMLVideoElement>(null);
  const recording = recordings[recordingIndex];
  useEffect(() => {
    if (playerRef.current) playerRef.current.playbackRate = speed;
  }, [speed, recording.src]);

  return <>
    <div className="video-stage">
      <video id="recording" key={recording.src} ref={playerRef} src={recording.src} controls playsInline preload="auto" aria-label={`Recording of ${scenario.name}`} onError={() => setFailed(true)} onLoadedData={(event) => {
        const player = event.currentTarget;
        player.playbackRate = speed;
        // Sample an opening frame while leaving playback close to the recording's start.
        if (player.currentTime === 0 && Number.isFinite(player.duration)) player.currentTime = Math.min(0.15, player.duration / 2);
      }} />
      <div id="video-error" className="video-error" hidden={!failed}>Recording could not be loaded.</div>
    </div>
    <div className="playback-bar">
      <label className="sr-only" htmlFor="recording-select">Recording attempt</label>
      <select id="recording-select" value={recordingIndex} onChange={(event) => { setFailed(false); setRecordingIndex(Number(event.target.value)); }}>
        {recordings.map((candidate, index) => <option key={`${candidate.run.id}-${candidate.index}`} value={index}>
          {candidate.run.project} / Attempt {candidate.run.retry + 1} / {labels[candidate.run.status]}
          {scenario.examples.length > 0 ? ` / ${candidate.run.name}` : ''}
          {candidate.run.recordings.length > 1 ? ` / Video ${candidate.index + 1}` : ''}
        </option>)}
      </select>
      <span id="run-duration" className="subtle">{duration(recording.run.duration)}</span>
      <div className="playback-actions"><label className="sr-only" htmlFor="playback-speed">Playback speed</label>
        <select id="playback-speed" title="Playback speed" value={speed} onChange={(event) => setSpeed(Number(event.target.value))}>
          {[0.5, 1, 1.5, 2].map((value) => <option key={value} value={value}>{value}x</option>)}
        </select>
        <a id="download-video" className="icon-button" href={recording.src} download title="Download recording" aria-label="Download recording"><Download aria-hidden="true" /></a>
      </div>
    </div>
  </>;
}

/**
 * Inputs are the selected entry, its zero-based position and total in the filtered
 * list, previous/next navigation callbacks, and a callback accepting notification text.
 * @returns The feature context, specification and recordings for that scenario.
 * The parent keys this component by scenario ID to reset playback and expanded details.
 */
function ScenarioDetail({ entry, index, count, onPrevious, onNext, onNotify }: {
  entry: Entry;
  index: number;
  count: number;
  onPrevious: () => void;
  onNext: () => void;
  onNotify: (message: string) => void;
}) {
  const { feature, scenario } = entry;
  const recordings = recordingsFor(scenario);
  /**
   * Takes no arguments; copies the current URL with this scenario's fragment.
   * @returns A promise resolving after clipboard handling; success/failure is reported
   * through onNotify rather than propagated as an unhandled browser error.
   */
  const copyLink = async () => {
    try {
      const url = new URL(location.href);
      url.hash = scenario.id;
      await navigator.clipboard.writeText(url.href);
      onNotify('Scenario link copied');
    } catch {
      onNotify('Copy the scenario URL from your address bar');
    }
  };

  return <>
    <div className="feature-context"><div className="eyebrow"><FolderOpen aria-hidden="true" />{feature.name}</div>{feature.description && <p>{feature.description}</p>}</div>
    <div className="scenario-heading"><div><div className="scenario-kicker">SCENARIO {String(index + 1).padStart(2, '0')} <span>/ {String(count).padStart(2, '0')}</span>{scenario.rule && <span> / {scenario.rule}</span>}</div><h2>{scenario.name}</h2></div>
      <div className="heading-actions">
        <button className="icon-button" id="copy-link" aria-label="Copy scenario link" title="Copy scenario link" onClick={copyLink}><LinkIcon aria-hidden="true" /></button>
        <button className="icon-button" id="previous" aria-label="Previous scenario" title="Previous scenario" disabled={index === 0} onClick={onPrevious}><ArrowLeft aria-hidden="true" /></button>
        <button className="icon-button" id="next" aria-label="Next scenario" title="Next scenario" disabled={index === count - 1} onClick={onNext}><ArrowRight aria-hidden="true" /></button>
      </div>
    </div>
    <div className="scenario-facts"><StatusBadge status={scenario.status} />{scenario.tags.map((tag, index) => <span className="tag" key={`${tag}-${index}`}>{tag}</span>)}<span className="source-location"><FileCode2 aria-hidden="true" />{feature.file}:{scenario.line}</span></div>
    {scenario.description && <p className="scenario-description">{scenario.description}</p>}
    <section className="specification" aria-labelledby="spec-heading">
      <div className="section-heading"><h3 id="spec-heading"><ListChecks aria-hidden="true" />The specification</h3><span className="subtle">{scenario.steps.length} steps</span></div>
      {scenario.background.length > 0 && <details className="background"><summary>Background <span>{scenario.background.length} steps</span><ChevronDown aria-hidden="true" /></summary><Steps steps={scenario.background} /></details>}
      <Steps steps={scenario.steps} />
      {scenario.examples.map((example, index) => <div key={index}><h4 className="examples-heading">{example.name || 'Examples'}</h4><DataTable headers={example.headers} rows={example.rows} /></div>)}
    </section>
    <section className="recording-section" aria-labelledby="recording-heading">
      <div className="section-heading"><h3 id="recording-heading"><Clapperboard aria-hidden="true" />Screen recording</h3><span className="subtle">{recordings.length ? `${recordings.length} recording${recordings.length === 1 ? '' : 's'}` : 'No recording'}</span></div>
      {recordings.length > 0 ? <RecordingPlayer scenario={scenario} recordings={recordings} /> : <div className="no-recording">
        {scenario.status === 'planned' ? <CalendarClock aria-hidden="true" /> : <VideoOff aria-hidden="true" />}
        <h4>{scenario.status === 'planned' ? 'Not yet implemented' : scenario.status === 'unmatched' ? 'Ambiguous scenario match' : 'No video captured'}</h4>
        <p>{scenario.status === 'planned' ? 'Planned scenario' : scenario.runs.length ? 'Test results available without a recording' : 'No matching result in this snapshot'}</p>
      </div>}
    </section>
    <footer className="detail-footer"><span>{feature.file}</span><span>SCENARIO {index + 1} OF {count}</span></footer>
  </>;
}

/**
 * Input is a loaded manifest; the snapshot is not modified by the viewer.
 * @returns The interactive catalogue/detail layout and notification region.
 * Owns filter and selection state, preferring a valid deep link, then a recorded
 * scenario, then the first definition. Effects synchronize title, history and toasts.
 */
function FeatureLibrary({ library }: { library: LibraryManifest }) {
  const entries: Entry[] = library.features.flatMap((feature) => feature.scenarios.map((scenario) => ({
    feature, scenario,
    searchText: [feature.name, feature.description, scenario.name, scenario.description, scenario.rule, ...scenario.tags, ...scenario.background.map((step) => step.text), ...scenario.steps.map((step) => step.text)].join(' ').toLocaleLowerCase(),
  })));
  const [filters, setFilters] = useState(defaultFilters);
  const [selectedId, setSelectedId] = useState<string | undefined>(() =>
    entries.find(({ scenario }) => scenario.id === location.hash.slice(1))?.scenario.id
    ?? entries.find(({ scenario }) => recordingsFor(scenario).length > 0)?.scenario.id ?? entries[0]?.scenario.id);
  const [toast, setToast] = useState('');
  const detailRef = useRef<HTMLElement>(null);
  const visible = filterEntries(entries, filters);
  const entry = visible.find(({ scenario }) => scenario.id === selectedId) ?? visible[0];
  const index = entry ? visible.indexOf(entry) : -1;

  /**
   * @param next - Entry to select; undefined (for example, past a list boundary) is ignored.
   * @param push - Whether to add a history entry; false when responding to browser history.
   * @returns Nothing; changes selection and scrolls the detail panel into view on mobile.
   */
  const selectEntry = (next?: Entry, push = true) => {
    if (!next) return;
    setSelectedId(next.scenario.id);
    if (push) setHash(next.scenario.id);
    if (matchMedia('(max-width: 760px)').matches) detailRef.current?.scrollIntoView({ block: 'start' });
  };
  /**
   * @param next - Complete replacement filter state from the controlled form.
   * @returns Nothing; keeps the current selection if visible, otherwise chooses the
   * first match and replaces the URL fragment without adding a history entry.
   */
  const changeFilters = (next: Filters) => {
    const nextVisible = filterEntries(entries, next);
    const nextEntry = nextVisible.find(({ scenario }) => scenario.id === selectedId) ?? nextVisible[0];
    setFilters(next);
    setSelectedId(nextEntry?.scenario.id);
    if (nextEntry) setHash(nextEntry.scenario.id, true);
  };
  /**
   * Takes no arguments and reads the latest location fragment and filter state.
   * Returns nothing; valid history/deep-link targets become selected, clearing filters
   * only when necessary. Unknown fragments, including the skip-link target, are ignored.
   */
  const onHashChange = useEffectEvent(() => {
    const next = entries.find(({ scenario }) => scenario.id === location.hash.slice(1));
    if (!next) return;
    if (!visible.some(({ scenario }) => scenario.id === next.scenario.id)) setFilters(defaultFilters);
    selectEntry(next, false);
  });
  useEffect(() => {
    const listener = () => onHashChange();
    window.addEventListener('hashchange', listener);
    return () => window.removeEventListener('hashchange', listener);
  }, []);
  useEffect(() => {
    document.title = entry ? `${entry.scenario.name} | Grid feature library` : 'Grid | Feature library';
    if (entry) setHash(entry.scenario.id, true);
  }, [entry?.scenario.id, entry?.scenario.name]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 2600);
    return () => clearTimeout(timer);
  }, [toast]);

  return <>
    <PageHeader library={library} />
    <div className="workspace">
      <Catalogue features={library.features} visible={visible} filters={filters} selectedId={entry?.scenario.id} onFiltersChange={changeFilters} onSelect={selectEntry} />
      <main id="detail" tabIndex={-1} ref={detailRef}>
        {entry ? <ScenarioDetail key={entry.scenario.id} entry={entry} index={index} count={visible.length} onPrevious={() => selectEntry(visible[index - 1])} onNext={() => selectEntry(visible[index + 1])} onNotify={setToast} />
          : <div className="empty-state"><ListFilter aria-hidden="true" /><h2>{entries.length ? 'No matching scenarios' : 'No features yet'}</h2></div>}
      </main>
    </div>
    <div id="toast" className={toast ? 'visible' : ''} role="status" aria-live="polite">{toast}</div>
  </>;
}

/**
 * Root component with no props. Fetches the adjacent, prebuilt library.json snapshot.
 * @returns Loading/error UI or FeatureLibrary once data is ready; Retry starts a new request.
 * Each effect aborts its request during cleanup, including React StrictMode remounts.
 */
function App() {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setState({ status: 'loading' });
    /**
     * Uses the current effect's abort signal to fetch the snapshot; takes no arguments.
     * @returns A promise resolving after state is updated or an aborted response is ignored.
     * HTTP/JSON failures become retryable UI state rather than rejected event-handler promises.
     */
    const load = async () => {
      try {
        const response = await fetch('library.json', { signal: controller.signal });
        if (!response.ok) throw new Error(`Library request failed (${response.status})`);
        const library: LibraryManifest = await response.json();
        if (!controller.signal.aborted) setState({ status: 'ready', library });
      } catch (error) {
        if (!controller.signal.aborted) setState({ status: 'error', message: error instanceof Error ? error.message : String(error) });
      }
    };
    void load();
    return () => controller.abort();
  }, [attempt]);

  if (state.status === 'ready') return <FeatureLibrary library={state.library} />;
  return <>
    <PageHeader loading={state.status === 'loading'} />
    <main id="detail" tabIndex={-1}><div className="empty-state">
      {state.status === 'loading' ? <><LoaderCircle aria-hidden="true" /><h2>Loading the library</h2></>
        : <><CircleAlert aria-hidden="true" /><h2>The library is unavailable</h2><p>{state.message}</p><button className="text-button" id="retry-load" onClick={() => setAttempt((previous) => previous + 1)}>Retry</button></>}
    </div></main>
  </>;
}

const root = document.getElementById('root');
if (!root) throw new Error('Feature library root element is missing.');
createRoot(root).render(<StrictMode><App /></StrictMode>);