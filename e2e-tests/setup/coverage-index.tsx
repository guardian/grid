/** @jsxRuntime automatic */
/** The coverage breakdown index written by global teardown, rendered to static HTML with React. */
import { renderToStaticMarkup } from 'react-dom/server';

export interface CoverageRow {
  kind: 'feature' | 'scenario';
  title: string;
  /** Link to the row's monocart report directory, relative to the index. */
  href: string;
  lines: string;
  functions: string;
  branches: string;
}

const styles = `
body { font-family: sans-serif; }
td, th { padding: 4px 12px; text-align: left; }
tr.feature td { font-weight: bold; padding-top: 12px; }
tr.scenario td:first-child { padding-left: 32px; }
`;

function CoverageIndex({ rows }: { rows: CoverageRow[] }) {
  return <html lang="en">
    <head>
      <meta charSet="utf-8" />
      <title>Coverage by feature and scenario</title>
      <style>{styles}</style>
    </head>
    <body>
      <h1>Coverage by feature and scenario</h1>
      <p><a href="../index.html">All features combined</a></p>
      <table>
        <thead><tr><th>Feature / Scenario</th><th>Lines</th><th>Functions</th><th>Branches</th></tr></thead>
        <tbody>{rows.map((row) => <tr key={row.href} className={row.kind}>
          <td><a href={`${row.href}/index.html`}>{row.title}</a></td>
          <td>{row.lines}</td><td>{row.functions}</td><td>{row.branches}</td>
        </tr>)}</tbody>
      </table>
    </body>
  </html>;
}

/** @returns A complete HTML document; React escapes titles, so scenario names can't inject markup. */
export function renderCoverageIndex(rows: CoverageRow[]): string {
  return `<!doctype html>\n${renderToStaticMarkup(<CoverageIndex rows={rows} />)}\n`;
}
