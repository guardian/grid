/**
 * Builds an approximate static call graph of Kahuna's browser code, plus a module import graph,
 * with a precomputed layout so the viewer only has to draw it.
 */
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';
import type { CallGraph, CoverageManifest } from './types.ts';

const extensions = ['.js', '.ts', '.tsx', '.jsx'];
const functionCell = 8;
/** Space between function levels, leaving room for right-angled edges' horizontal runs. */
const functionRowGap = 240;
/** Each function level wraps onto this many lines; the widest level uses the maximum. */
const functionLines = { min: 2, max: 5 };
const moduleCell = 70;
const endpointsPerRow = 5;
const moduleColumns = 24;

const round = (value: number) => Math.round(value * 10) / 10;

interface ImportBinding { file: number; imported: string }
interface PendingCall { caller: number; file: number; callee: ts.Expression }
interface ParsedFunction { name: string; file: number; line: number }

async function sourceFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && extensions.includes(path.extname(entry.name)) && !entry.name.endsWith('.d.ts'))
    .map((entry) => path.join(entry.parentPath, entry.name))
    .sort();
}

function functionName(node: ts.SignatureDeclaration): string {
  if (node.name && (ts.isIdentifier(node.name) || ts.isStringLiteral(node.name))) return node.name.text;
  const parent = node.parent;
  if ((ts.isVariableDeclaration(parent) || ts.isPropertyAssignment(parent) || ts.isPropertyDeclaration(parent)) && ts.isIdentifier(parent.name)) return parent.name.text;
  if (ts.isBinaryExpression(parent) && parent.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
    if (ts.isPropertyAccessExpression(parent.left)) return parent.left.name.text;
    if (ts.isIdentifier(parent.left)) return parent.left.text;
  }
  return '(anonymous)';
}

/**
 * Assigns each node to one of 3–5 rows: nodes nothing points at go in the top row, nodes that
 * point at nothing go in the bottom row, and the rest are spread between by their relative
 * position along the longest path through them. Cycles are collapsed so they share a row.
 */
function assignRows(n: number, edges: [number, number][]): { row: number[]; rows: number } {
  const out: number[][] = Array.from({ length: n }, () => []);
  for (const [from, to] of edges) out[from].push(to);

  // Tarjan's algorithm; components come out in reverse topological order (sinks first).
  const component = new Array<number>(n).fill(-1);
  const index = new Array<number>(n).fill(-1);
  const low = new Array<number>(n).fill(0);
  const onStack = new Array<boolean>(n).fill(false);
  const stack: number[] = [];
  let counter = 0;
  let components = 0;
  const strongConnect = (v: number) => {
    index[v] = low[v] = counter++;
    stack.push(v);
    onStack[v] = true;
    for (const w of out[v]) {
      if (index[w] === -1) {
        strongConnect(w);
        low[v] = Math.min(low[v], low[w]);
      } else if (onStack[w]) low[v] = Math.min(low[v], index[w]);
    }
    if (low[v] !== index[v]) return;
    let w: number;
    do {
      w = stack.pop()!;
      onStack[w] = false;
      component[w] = components;
    } while (w !== v);
    components++;
  };
  for (let v = 0; v < n; v++) if (index[v] === -1) strongConnect(v);

  const successors: Set<number>[] = Array.from({ length: components }, () => new Set());
  const predecessors: Set<number>[] = Array.from({ length: components }, () => new Set());
  for (const [from, to] of edges) {
    if (component[from] === component[to]) continue;
    successors[component[from]].add(component[to]);
    predecessors[component[to]].add(component[from]);
  }
  const height = new Array<number>(components).fill(0);
  for (let c = 0; c < components; c++) for (const s of successors[c]) height[c] = Math.max(height[c], height[s] + 1);
  const depth = new Array<number>(components).fill(0);
  for (let c = components - 1; c >= 0; c--) for (const p of predecessors[c]) depth[c] = Math.max(depth[c], depth[p] + 1);

  const rows = Math.min(5, Math.max(3, Math.max(0, ...depth) + 1));
  const row = component.map((c) => {
    if (!predecessors[c].size) return 0;
    if (!successors[c].size) return rows - 1;
    return 1 + Math.min(rows - 3, Math.floor((depth[c] / (depth[c] + height[c])) * (rows - 2)));
  });
  return { row, rows };
}

/**
 * Lays rows out top to bottom, wrapping each row's nodes into a centred grid of at most `columns` cells.
 * @param order - Node ids in the order they should fill their row.
 */
function gridLayout(order: number[], row: number[], rows: number, columns: number, cell: number, labels: string[], rowGap = cell * 4, minLines = 1) {
  const positions = new Array<{ x: number; y: number }>(row.length);
  const bands: CallGraph['functionRows'] = [];
  let top = 0;
  for (let r = 0; r < rows; r++) {
    const ids = order.filter((id) => row[id] === r);
    const width = Math.min(columns, Math.max(1, Math.ceil(ids.length / minLines)));
    const left = ((columns - width) * cell) / 2;
    ids.forEach((id, i) => {
      positions[id] = { x: round(left + (i % width + 0.5) * cell), y: round(top + (Math.floor(i / width) + 0.5) * cell) };
    });
    const bottom = top + Math.max(1, Math.ceil(ids.length / width)) * cell;
    bands.push({ label: labels[r], top: round(top), bottom: round(bottom), count: ids.length });
    top = bottom + rowGap;
  }
  return { positions, bands };
}

function rowLabels(rows: number, first: string, middle: string, last: string): string[] {
  return Array.from({ length: rows }, (_, r) => r === 0 ? first : r === rows - 1 ? last : rows === 3 ? middle : `${middle} (${r} of ${rows - 2})`);
}

/** Theseus (HATEOAS client) methods that resolve a link or action by its relation name. */
const relationMethods: Record<string, string> = { follow: 'follow', perform: 'perform', getLink: 'link', getAction: 'action' };
const httpMethods = ['get', 'post', 'put', 'patch', 'delete', 'head'];

/**
 * @returns The endpoint a call reaches over the network, or undefined if it doesn't look like a request.
 * Recognises fetch, $http, Theseus link/action relations and writes to Theseus resources (`x.data.y.post(...)`).
 * Relation names stand in for URLs, which are only known at runtime.
 */
function networkTarget(call: ts.CallExpression, source: ts.SourceFile): { kind: string; label: string } | undefined {
  const callee = call.expression;
  const first = call.arguments[0];
  const literal = first && (ts.isStringLiteral(first) || ts.isNoSubstitutionTemplateLiteral(first)) ? first.text : undefined;
  const text = (node: ts.Node) => node.getText(source).replace(/\s+/g, ' ').slice(0, 60);
  if (ts.isIdentifier(callee) && callee.text === 'fetch' && first) return { kind: 'fetch', label: literal ?? text(first) };
  if (!ts.isPropertyAccessExpression(callee)) return undefined;
  const method = callee.name.text;
  if (Object.hasOwn(relationMethods, method) && literal) return { kind: relationMethods[method], label: literal };
  const receiver = callee.expression;
  if (ts.isIdentifier(receiver) && receiver.text === '$http' && httpMethods.includes(method) && first) {
    return { kind: method.toUpperCase(), label: literal ?? text(first) };
  }
  if (method !== 'get' && httpMethods.includes(method) && /\.data\b/.test(receiver.getText(source))) {
    return { kind: method.toUpperCase(), label: ts.isPropertyAccessExpression(receiver) ? receiver.name.text : text(receiver) };
  }
  return undefined;
}

/**
 * Places endpoints in a band below the last row, wrapped to `width`, ordered by the mean x of their callers.
 * @returns Positions and the band, both in the given view's coordinates.
 */
function endpointLayout(count: number, callers: { x: number }[][], bands: CallGraph['functionRows'], width: number, rowGap: number) {
  // Five per row, spread across the view's width, leaves room for every label.
  const columns = Math.max(1, Math.min(count, endpointsPerRow));
  // Rows are a third as tall as cells are wide, so labels stay clear of each other at the fitted zoom.
  const cell = { width: Math.max(110, width / columns), height: Math.max(44, width / columns / 3) };
  const mean = (list: { x: number }[]) => list.reduce((sum, point) => sum + point.x, 0) / Math.max(1, list.length);
  const order = Array.from({ length: count }, (_, id) => id).sort((a, b) => mean(callers[a]) - mean(callers[b]));
  const top = (bands.at(-1)?.bottom ?? 0) + rowGap;
  const left = (width - columns * cell.width) / 2;
  const positions = new Array<{ x: number; y: number }>(count);
  order.forEach((id, i) => {
    positions[id] = { x: round(left + (i % columns + 0.5) * cell.width), y: round(top + (Math.floor(i / columns) + 0.5) * cell.height) };
  });
  const band = { label: 'Network endpoints', top: round(top), bottom: round(top + Math.max(1, Math.ceil(count / columns)) * cell.height), count };
  return { positions, band };
}

/**
 * @param kahunaDir - Kahuna project root; sources are read from `public/js`.
 * @param coverage - Optional coverage snapshot whose functions are matched to graph nodes by file and line.
 * @returns Function and module graphs with layout. Calls are resolved by name, so dynamic and
 * dependency-injected calls are best-effort, and callbacks are linked from their enclosing function.
 */
export async function buildCallGraph(kahunaDir: string, coverage: CoverageManifest | null): Promise<CallGraph> {
  const absolutePaths = await sourceFiles(path.join(kahunaDir, 'public/js'));
  const files = absolutePaths.map((file) => path.relative(kahunaDir, file).split(path.sep).join('/'));
  const fileIndex = new Map(files.map((file, index) => [file, index]));
  const resolve = (from: string, specifier: string) => {
    if (!specifier.startsWith('.')) return undefined;
    const base = path.posix.join(path.posix.dirname(from), specifier);
    for (const candidate of [base, ...extensions.map((ext) => base + ext), ...extensions.map((ext) => `${base}/index${ext}`)]) {
      const index = fileIndex.get(candidate);
      if (index !== undefined) return index;
    }
    return undefined;
  };

  const functions: ParsedFunction[] = [];
  const nested: [number, number][] = [];
  const pending: PendingCall[] = [];
  const endpointIds = new Map<string, number>();
  const endpoints: { kind: string; label: string }[] = [];
  const network = new Set<string>();
  const imports = new Set<string>();
  const bindings: Map<string, ImportBinding>[] = [];
  const byFileName: Map<string, number[]>[] = [];
  const byName = new Map<string, number[]>();

  for (const [file, relative] of files.entries()) {
    const text = await readFile(absolutePaths[file], 'utf8');
    const kind = relative.endsWith('.tsx') ? ts.ScriptKind.TSX : relative.endsWith('.ts') ? ts.ScriptKind.TS : ts.ScriptKind.JSX;
    const source = ts.createSourceFile(relative, text, ts.ScriptTarget.Latest, true, kind);
    const fileBindings = new Map<string, ImportBinding>();
    const fileNames = new Map<string, number[]>();
    bindings.push(fileBindings);
    byFileName.push(fileNames);

    const visit = (node: ts.Node, enclosing: number | undefined): void => {
      if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
        const target = resolve(relative, node.moduleSpecifier.text);
        if (target === undefined) return;
        imports.add(`${file}:${target}`);
        const clause = ts.isImportDeclaration(node) ? node.importClause : undefined;
        if (clause?.name) fileBindings.set(clause.name.text, { file: target, imported: 'default' });
        const named = clause?.namedBindings;
        if (named && ts.isNamespaceImport(named)) fileBindings.set(named.name.text, { file: target, imported: '*' });
        if (named && ts.isNamedImports(named)) {
          for (const element of named.elements) fileBindings.set(element.name.text, { file: target, imported: (element.propertyName ?? element.name).text });
        }
        return;
      }
      if (ts.isFunctionLike(node) && 'body' in node && node.body) {
        const name = functionName(node);
        const id = functions.push({ name, file, line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1 }) - 1;
        if (name !== '(anonymous)') {
          for (const index of [fileNames, byName]) index.set(name, [...(index.get(name) ?? []), id]);
        }
        if (enclosing !== undefined) nested.push([enclosing, id]);
        ts.forEachChild(node, (child) => visit(child, id));
        return;
      }
      if (ts.isCallExpression(node) && enclosing !== undefined) {
        pending.push({ caller: enclosing, file, callee: node.expression });
        const target = networkTarget(node, source);
        if (target) {
          const key = `${target.kind} ${target.label}`;
          if (!endpointIds.has(key)) endpointIds.set(key, endpoints.push(target) - 1);
          network.add(`${enclosing}:${endpointIds.get(key)}`);
        }
      }
      ts.forEachChild(node, (child) => visit(child, enclosing));
    };
    visit(source, undefined);
  }

  // Prefer same-file definitions, then the imported module, then a globally unique name.
  const resolveCall = ({ file, callee }: PendingCall): number | undefined => {
    const inFile = (target: number, name: string) => byFileName[target].get(name)?.[0];
    if (ts.isIdentifier(callee)) {
      const local = inFile(file, callee.text);
      if (local !== undefined) return local;
      const binding = bindings[file].get(callee.text);
      if (binding) return inFile(binding.file, binding.imported === 'default' || binding.imported === '*' ? callee.text : binding.imported);
      return undefined;
    }
    if (ts.isPropertyAccessExpression(callee)) {
      const name = callee.name.text;
      if (ts.isIdentifier(callee.expression)) {
        const binding = bindings[file].get(callee.expression.text);
        if (binding) return inFile(binding.file, name);
      }
      const local = inFile(file, name);
      if (local !== undefined) return local;
      const global = byName.get(name);
      return global?.length === 1 ? global[0] : undefined;
    }
    return undefined;
  };
  const calls = new Set(nested.map(([a, b]) => `${a}:${b}`));
  for (const call of pending) {
    const target = resolveCall(call);
    if (target !== undefined && target !== call.caller) calls.add(`${call.caller}:${target}`);
  }

  const counts = files.map(() => 0);
  for (const fn of functions) counts[fn.file]++;
  const importPairs = [...imports].map((pair) => pair.split(':').map(Number) as [number, number]);
  const callPairs = [...calls].map((pair) => pair.split(':').map(Number) as [number, number]);
  // Ids are already in file-path then source order, which keeps each file's nodes together within a row.
  const functionRows = assignRows(functions.length, callPairs);
  const widestRow = Math.max(...Array.from({ length: functionRows.rows }, (_, r) => functionRows.row.filter((value) => value === r).length));
  const functionGrid = gridLayout(functions.map((_, id) => id), functionRows.row, functionRows.rows, Math.ceil(widestRow / functionLines.max), functionCell,
    rowLabels(functionRows.rows, 'Entry points (no callers)', 'Intermediate calls', 'Final calls (no callees)'), functionRowGap, functionLines.min);
  const moduleRows = assignRows(files.length, importPairs);
  const moduleGrid = gridLayout(files.map((_, id) => id), moduleRows.row, moduleRows.rows, moduleColumns, moduleCell,
    rowLabels(moduleRows.rows, 'Entry modules (not imported)', 'Intermediate modules', 'Leaf modules (no local imports)'));

  const byLine = new Map<string, number[]>();
  functions.forEach((fn, id) => {
    const key = `${files[fn.file]}:${fn.line}`;
    byLine.set(key, [...(byLine.get(key) ?? []), id]);
  });
  const coverageNodes = (coverage?.functions ?? []).map((fn) => {
    const candidates = byLine.get(`${fn.file}:${fn.line}`) ?? [];
    return candidates.find((id) => functions[id].name === fn.name) ?? candidates[0] ?? -1;
  });

  const networkPairs = [...network].map((pair) => pair.split(':').map(Number) as [number, number]);
  const callersOf = (positions: { x: number }[], owner: (fn: number) => number) => endpoints.map((_, endpoint) =>
    networkPairs.flatMap(([fn, target]) => target === endpoint ? [positions[owner(fn)]] : []));
  const widthOf = (positions: { x: number }[], cell: number) => Math.max(...positions.map((point) => point.x)) + cell / 2;
  const functionEndpoints = endpointLayout(endpoints.length, callersOf(functionGrid.positions, (fn) => fn), functionGrid.bands,
    widthOf(functionGrid.positions, functionCell), functionRowGap);
  const moduleEndpoints = endpointLayout(endpoints.length, callersOf(moduleGrid.positions, (fn) => functions[fn].file), moduleGrid.bands,
    widthOf(moduleGrid.positions, moduleCell), moduleCell * 4);

  return {
    files: files.map((file, index) => ({
      path: file, ...moduleGrid.positions[index],
      radius: round(Math.min(moduleCell / 2 - 4, 4 + 2 * Math.sqrt(counts[index]))),
    })),
    imports: importPairs,
    functions: functions.map((fn, id) => ({ name: fn.name, file: fn.file, line: fn.line, ...functionGrid.positions[id] })),
    calls: callPairs,
    coverage: coverageNodes,
    functionRows: endpoints.length ? [...functionGrid.bands, functionEndpoints.band] : functionGrid.bands,
    moduleRows: endpoints.length ? [...moduleGrid.bands, moduleEndpoints.band] : moduleGrid.bands,
    endpoints: endpoints.map((endpoint, id) => ({
      ...endpoint,
      function: functionEndpoints.positions[id],
      module: moduleEndpoints.positions[id],
      paths: [],
    })),
    network: networkPairs,
  };
}
