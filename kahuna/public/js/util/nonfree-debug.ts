/* eslint-disable no-console */
// TEMPORARY diagnostics for the nonFree / date-filter back-button race.
// Set `window.__NF_DEBUG = false` in the console to silence. Remove once diagnosed.

const started = Date.now();

type Probe = () => Record<string, unknown>;

const probes: { name: string, probe: Probe }[] = [];

function enabled(): boolean {
  return (window as any).__NF_DEBUG !== false;
}

export function nfLog(source: string, message: string, detail?: Record<string, unknown>): void {
  if (!enabled()) {
    return;
  }
  const elapsed = String(Date.now() - started).padStart(6, ' ');
  console.log(
    `[NF ${elapsed}ms] ${source} :: ${message}`,
    {
      ...(detail || {}),
      search: window.location.search,
      histLen: window.history.length
    }
  );
}

// Lets us interrogate every live controller instance after the UI has gone stale,
// which one-shot log lines can't do.
export function nfRegisterProbe(name: string, probe: Probe): () => void {
  const entry = { name, probe };
  probes.push(entry);
  return () => {
    const i = probes.indexOf(entry);
    if (i > -1) {
      probes.splice(i, 1);
    }
  };
}

export function nfDump(reason: string): void {
  if (!enabled()) {
    return;
  }
  console.log(`[NF DUMP: ${reason}] page`, {
    search: window.location.search,
    histLen: window.history.length,
    liveProbes: probes.length,
    // >1 of any of these means a zombie/duplicate view is still on the page
    domSearchWrappers: document.querySelectorAll('.gr-search-wrapper').length,
    domPermissionsFilters: document.querySelectorAll('.permissions-filter').length,
    domDateRanges: document.querySelectorAll('.search__date').length,
    domSearchForms: document.querySelectorAll('form.search').length,
    domTopBars: document.querySelectorAll('gr-top-bar').length
  });
  probes.forEach(p => {
    try {
      console.log(`[NF DUMP: ${reason}] ${p.name}`, p.probe());
    } catch (e) {
      console.log(`[NF DUMP: ${reason}] ${p.name} PROBE FAILED`, e);
    }
  });
}

(window as any).__NF_DUMP = () => nfDump('manual');
