/** Feature → scenario list shared by the coverage pages; hovering previews a selection, clicking commits it. */
import { useMemo, useRef } from 'react';
import { LocateFixed, X } from 'lucide-react';
import type { CoverageManifest } from './types.ts';

export const palette = ['#00adee', '#ffbc01', '#99cf91', '#ff9980', '#c39bd3', '#5dd6c0', '#f5a3c7', '#d4c26a', '#8fb3ff', '#e0915a'];
/** Reverses the report directory naming in setup/mcr.config.ts (`search__free-text` → `search/free-text.feature`). */
export const featureFile = (slug: string) => `${slug.replace(/__/g, '/')}.feature`;

export interface Selection { feature: number | 'all'; scenario: number | 'all' }

/**
 * @param onPreview - Called with the hovered or focused item, and undefined when the pointer or focus leaves.
 * Counts are the number of functions each feature or scenario ran.
 */
export function ScenarioList({ coverage, selected, onSelect, onPreview, className = '' }: {
  coverage: CoverageManifest;
  selected: Selection;
  onSelect: (next: Selection) => void;
  onPreview: (next?: Selection) => void;
  className?: string;
}) {
  const catalogue = useMemo(() => {
    const featureRuns = coverage.features.map(() => 0);
    const scenarioRuns = coverage.scenarios.map(() => 0);
    for (const link of coverage.links) featureRuns[link.feature]++;
    for (const link of coverage.scenarioLinks) scenarioRuns[link.scenario]++;
    return coverage.features.map((entry, id) => ({
      id, ...entry, runs: featureRuns[id],
      scenarios: coverage.scenarios.flatMap((s, sid) => s.feature === id ? [{ id: sid, name: s.name, runs: scenarioRuns[sid] }] : []),
    }));
  }, [coverage]);
  const navRef = useRef<HTMLElement>(null);
  const keyOf = ({ feature, scenario }: Selection) => `${feature}:${scenario}`;
  const item = (next: Selection) => ({
    type: 'button' as const,
    'data-key': keyOf(next),
    'aria-pressed': selected.feature === next.feature && selected.scenario === next.scenario,
    onMouseEnter: () => onPreview(next), onFocus: () => onPreview(next), onBlur: () => onPreview(undefined),
    onClick: () => onSelect(next),
  });
  const reveal = () => navRef.current?.querySelector(`.scenario-list-items [data-key="${keyOf(selected)}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  const pinned = selected.scenario !== 'all'
    ? { name: coverage.scenarios[selected.scenario].name, context: coverage.features[coverage.scenarios[selected.scenario].feature].name }
    : selected.feature !== 'all' ? { name: coverage.features[selected.feature].name, context: featureFile(coverage.features[selected.feature].slug) } : undefined;

  return <nav ref={navRef} className={`callgraph-scenarios ${className}`} aria-label="Scenarios by feature" onMouseLeave={() => onPreview(undefined)}>
    {pinned && <div className="scenario-pin">
      <span className="scenario-pin-label">{selected.scenario !== 'all' ? 'Selected scenario' : 'Selected feature'}</span>
      <div className="scenario-pin-row">
        <button type="button" className="callgraph-item" aria-pressed="true" title="Show in list" onClick={reveal}>
          <span className="callgraph-item-name">{pinned.name}<small>{pinned.context}</small></span><LocateFixed aria-hidden="true" />
        </button>
        <button type="button" className="icon-button" aria-label="Clear selection" title="Clear selection" onClick={() => onSelect({ feature: 'all', scenario: 'all' })}><X aria-hidden="true" /></button>
      </div>
    </div>}
    <div className="scenario-list-items">
    <button className="callgraph-item callgraph-all" {...item({ feature: 'all', scenario: 'all' })}>All features<span>{coverage.functions.length}</span></button>
    {catalogue.map((entry) => <section key={entry.slug}>
      <button className={`callgraph-item callgraph-feature${selected.feature === entry.id && selected.scenario !== 'all' ? ' contains-selection' : ''}`} {...item({ feature: entry.id, scenario: 'all' })}>
        <span className="callgraph-item-name">{entry.name}<small>{featureFile(entry.slug)}</small></span><span>{entry.runs}</span>
      </button>
      <ul>{entry.scenarios.map((scenario) => <li key={scenario.id}>
        <button className="callgraph-item" {...item({ feature: entry.id, scenario: scenario.id })}>
          <span className="callgraph-item-name">{scenario.name}</span><span>{scenario.runs}</span>
        </button>
      </li>)}</ul>
    </section>)}
    </div>
  </nav>;
}
