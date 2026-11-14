import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, posix, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = fileURLToPath(new URL("../../../../", import.meta.url));
export const REVIEW_DIR = "kupua/exploration/docs/03 Ce n'est pas une pipe dream/media-api-work";
export const COVERAGE_PATH = `${REVIEW_DIR}/api-boundary-06-coverage.json`;
export const EVIDENCE_PATH = `${REVIEW_DIR}/api-boundary-07-evidence.json`;
export const LOCAL_INSTRUCTIONS = [".github/copilot-instructions.md", ".github/instructions/media-api.instructions.md"];

const dispositions = new Set(["review-required", "scope-pending", "excluded"]);
const readingStates = new Set(["inventoried", "partial", "read", "verified"]);
const executionClasses = new Set(["mechanical", "strong", "strong-independent"]);
const packetStates = new Set(["planned", "ready", "in-progress", "reviewed", "accepted", "blocked"]);
const receiptMethods = new Set(["full-text", "line-ranges", "json-pointers", "structural", "visual"]);
const claimKinds = new Set(["source", "test-read", "executed-check", "recorded-measurement", "operator-decision", "inference"]);
const claimStates = new Set(["supported", "unverified", "disputed", "refuted", "superseded"]);
const shaPattern = /^[a-f0-9]{64}$/;

export function digest(content) {
  return createHash("sha256").update(content).digest("hex");
}

export function safePath(root, name) {
  assert.equal(typeof name, "string", "Path must be a string");
  assert.ok(name.length > 0 && !isAbsolute(name) && !name.includes("\\"), "Expected a repository-relative path");
  assert.ok(!name.split("/").includes("..") && posix.normalize(name) === name, "Path must be normalized and remain inside the repository");
  return resolve(root, name);
}

export function pathPolicy(name) {
  safePath(ROOT, name);
  if (/(^|\/)(node_modules|target|test-results|playwright-report|logs|\.cache)(\/|$)/.test(name) || name.startsWith("kahuna/public/dist/")) {
    return { disposition: "excluded", reason: "Generated, installed or potentially sensitive runtime output; content not read." };
  }
  if (/(^|\/)\.env(?:\.|$)|\.(pem|key|p12)$|(?:panda-auth|storageState|auth-state)\.json$/i.test(name)) {
    return { disposition: "excluded", reason: "Potential credential material; content not read." };
  }
  if (name === "kupua/exploration/docs/worklog-current.md" ||
      (name.startsWith(`${REVIEW_DIR}/`) && /\/api-boundary-(?:0[5-9]|1[0-2])-/.test(name)) ||
      name.startsWith("kupua/exploration/experiments/api-boundary/api-boundary-review")) {
    return { disposition: "excluded", reason: "Review administration, independently checked; outside application-coverage totals." };
  }
  if (name.startsWith("kupua/") || name.startsWith("media-api/") || LOCAL_INSTRUCTIONS.includes(name)) {
    return { disposition: "review-required", reason: "Explicit first-party Kupua/media-api or instruction scope." };
  }
  return { disposition: "scope-pending", reason: "Other Grid material; a strong reviewer must classify relevance and dependencies." };
}

export function snapshot(root, name, policy = pathPolicy(name)) {
  const fullPath = safePath(root, name);
  if (!existsSync(fullPath)) return { present: false, kind: "missing", bytes: null, lines: null, sha256: null };
  const stat = lstatSync(fullPath);
  if (stat.isSymbolicLink()) return { present: true, kind: "symlink", bytes: stat.size, lines: null, sha256: null };
  assert.ok(stat.isFile(), `Not a regular file: ${name}`);
  const resolved = relative(realpathSync(root), realpathSync(fullPath));
  assert.ok(resolved !== ".." && !resolved.startsWith("../") && !isAbsolute(resolved), "Refusing a path escaping the repository");
  if (policy.disposition === "excluded") return { present: true, kind: "metadata-only", bytes: stat.size, lines: null, sha256: null };
  const content = readFileSync(fullPath);
  const text = content.includes(0) ? null : content.toString("utf8");
  const lines = text === null ? null : text.length === 0 ? 0 : text.split("\n").length - Number(text.endsWith("\n"));
  const kind = text === null ? "binary" : name.endsWith(".md") ? "document" : name.endsWith(".json") ? "structured-data" : "text";
  return { present: true, kind, bytes: stat.size, lines, sha256: digest(content) };
}

export function makeInventory(root, listedPaths, previous, { head, generatedAt = new Date().toISOString() }) {
  assert.match(head, /^[a-f0-9]{40}$/, "Supply the inspected Git HEAD");
  assert.ok(listedPaths.length > 0, "Refusing an empty repository listing");
  if (previous) assert.equal(previous.schemaVersion, 1, "Unsupported coverage schema");
  const enumerated = new Set(listedPaths);
  for (const name of LOCAL_INSTRUCTIONS) if (existsSync(safePath(root, name))) enumerated.add(name);
  const priorByPath = new Map((previous?.files ?? []).map(file => [file.path, file]));
  const paths = [...new Set([...enumerated, ...priorByPath.keys()])].sort();
  const files = paths.map(name => {
    const prior = priorByPath.get(name);
    const policy = prior ? { disposition: prior.disposition, reason: prior.reason } : pathPolicy(name);
    const current = snapshot(root, name, policy);
    const changed = prior && (prior.sha256 !== current.sha256 || prior.present !== current.present || !enumerated.has(name));
    return {
      path: name,
      area: name.includes("/") ? name.split("/")[0] : "repository-root",
      ...current,
      enumerated: enumerated.has(name),
      ...policy,
      classifiedBy: prior?.classifiedBy ?? "protocol",
      status: prior?.status ?? "inventoried",
      stale: Boolean(prior?.stale || changed),
      packetIds: prior?.packetIds ?? [],
      receipts: prior?.receipts ?? [],
      ...(prior?.verificationPacketId ? { verificationPacketId: prior.verificationPacketId } : {}),
    };
  });
  return {
    schemaVersion: 1,
    baseline: { initialHead: previous?.baseline.initialHead ?? head, inventoryHead: head, generatedAt },
    enumeration: {
      method: "git ls-files --cached --others --exclude-standard -z, plus named local instructions",
      ignoredMaterial: "Ignored local data/configuration is not implicitly covered; discover runtime dependencies through source and explicit permission.",
      instructionPaths: LOCAL_INSTRUCTIONS,
    },
    files,
    packets: previous?.packets ?? [],
    dependencies: previous?.dependencies ?? [],
  };
}

export function jsonPointer(document, pointer) {
  assert.equal(typeof pointer, "string", "JSON pointer must be a string");
  if (pointer === "") return document;
  assert.ok(pointer.startsWith("/"), "JSON pointer must start with /");
  let value = document;
  for (const encoded of pointer.slice(1).split("/")) {
    const key = encoded.replace(/~1/g, "/").replace(/~0/g, "~");
    assert.ok(value !== null && typeof value === "object" && Object.hasOwn(value, key), `Missing JSON pointer: ${pointer}`);
    value = value[key];
  }
  return value;
}

function fullyRead(file) {
  const currentReceipts = file.receipts.filter(receipt => receipt.sha256 === file.sha256);
  if (file.kind === "binary") return /\.png$/i.test(file.path) && currentReceipts.some(receipt => receipt.method === "visual" && receipt.extent === "whole-image");
  if (currentReceipts.some(receipt => receipt.method === "full-text")) return true;
  if (!Number.isInteger(file.lines) || file.lines === 0) return false;
  const ranges = currentReceipts.flatMap(receipt => receipt.method === "line-ranges" ? receipt.ranges : []).sort((left, right) => left[0] - right[0]);
  let nextLine = 1;
  for (const [start, end] of ranges) {
    if (start > nextLine) break;
    nextLine = Math.max(nextLine, end + 1);
  }
  return nextLine > file.lines;
}

export function summarize(coverage) {
  const counts = field => Object.fromEntries([...new Set(coverage.files.map(file => file[field]))].sort().map(value => [value, coverage.files.filter(file => file[field] === value).length]));
  return {
    files: coverage.files.length,
    dispositions: counts("disposition"),
    reading: counts("status"),
    stale: coverage.files.filter(file => file.stale).length,
    missing: coverage.files.filter(file => !file.present && file.disposition !== "excluded").length,
    unassigned: coverage.files.filter(file => file.disposition === "review-required" && file.packetIds.length === 0).length,
    openDependencies: coverage.dependencies.filter(dependency => dependency.status !== "resolved").length,
    packets: coverage.packets.map(packet => ({ id: packet.id, status: packet.status, executionClass: packet.executionClass, title: packet.title })),
  };
}

export function validateRegisters(root, coverage, evidence, { enumeratedPaths, checkDisk = true } = {}) {
  const errors = [];
  const warnings = [];
  const check = (condition, message) => { if (!condition) errors.push(message); };
  check(coverage.schemaVersion === 1 && evidence.schemaVersion === 1, "Unsupported register schema");
  for (const field of ["files", "packets", "dependencies"]) check(Array.isArray(coverage[field]), `Missing coverage array: ${field}`);
  check(Array.isArray(evidence.claims), "Missing evidence claims array");
  if (errors.length) return { errors, warnings, readyForSynthesis: false };
  const files = new Map(coverage.files.map(file => [file.path, file]));
  const packets = new Map(coverage.packets.map(packet => [packet.id, packet]));
  check(files.size === coverage.files.length, "Duplicate file paths");
  check(packets.size === coverage.packets.length, "Duplicate packet IDs");
  check(new Set(evidence.claims.map(claim => claim.id)).size === evidence.claims.length, "Duplicate evidence IDs");

  function inspectReference(source, owner) {
    if (source.operatorReference) {
      check(typeof source.operatorReference === "string" && source.operatorReference.length > 0, `${owner}: missing operator reference`);
      return;
    }
    check(files.has(source.path) || source.path.startsWith(`${REVIEW_DIR}/api-boundary-`), `${owner}: uncatalogued source ${source.path}`);
    check(shaPattern.test(source.sha256 ?? ""), `${owner}: missing source fingerprint`);
    const policy = pathPolicy(source.path);
    assert.ok(policy.disposition !== "excluded" || policy.reason.startsWith("Review administration"), "Refusing an excluded source payload");
    const fullPath = safePath(root, source.path);
    check(existsSync(fullPath), `${owner}: missing source ${source.path}`);
    if (!existsSync(fullPath)) return;
    const current = snapshot(root, source.path, { disposition: "review-required" });
    assert.ok(current.sha256 !== null && current.kind !== "symlink", "Evidence must refer to a regular in-repository file");
    const content = readFileSync(fullPath);
    if (digest(content) !== source.sha256) warnings.push(`${owner}: stale source ${source.path}`);
    if (source.lines) {
      check(Number.isInteger(current.lines) && Array.isArray(source.lines) && source.lines.length === 2 && source.lines.every(Number.isInteger) && source.lines[0] >= 1 && source.lines[0] <= source.lines[1] && source.lines[1] <= current.lines, `${owner}: invalid source lines`);
    } else if (typeof source.pointer === "string") {
      jsonPointer(JSON.parse(content.toString("utf8")), source.pointer);
    } else check(false, `${owner}: source needs line range or JSON pointer`);
  }

  for (const packet of coverage.packets) {
    check(/^P\d{2,}$/.test(packet.id), `Invalid packet ID: ${packet.id}`);
    check(executionClasses.has(packet.executionClass), `${packet.id}: invalid execution class`);
    check(packetStates.has(packet.status), `${packet.id}: invalid status`);
    check(typeof packet.question === "string" && packet.question.length > 0, `${packet.id}: missing decision question`);
    check(Array.isArray(packet.assignments) && packet.assignments.length > 0, `${packet.id}: no assignments`);
    const isIndependentChallenge = packet.role === "candidate-challenge" && packet.executionClass === "strong-independent" && packet.report === `${REVIEW_DIR}/api-boundary-12-plan-challenge.md`;
    check(typeof packet.report === "string" && (packet.report.startsWith(`${REVIEW_DIR}/api-boundary-09-`) || isIndependentChallenge), `${packet.id}: report outside packet series`);
    for (const assignment of packet.assignments ?? []) {
      check(files.has(assignment.path), `${packet.id}: unlisted assignment ${assignment.path}`);
      check(files.get(assignment.path)?.packetIds?.includes(packet.id), `${packet.id}: assignment has no reciprocal file owner`);
      check(typeof assignment.scope === "string" && assignment.scope.length > 0, `${packet.id}: missing scope for ${assignment.path}`);
    }
    if (["reviewed", "accepted"].includes(packet.status)) check(existsSync(safePath(root, packet.report)), `${packet.id}: completed packet has no report`);
  }

  for (const file of coverage.files) {
    try {
      safePath(root, file.path);
      check(dispositions.has(file.disposition), `${file.path}: invalid disposition`);
      check(readingStates.has(file.status), `${file.path}: invalid reading status`);
      check(typeof file.reason === "string" && file.reason.length > 0, `${file.path}: missing scope reason`);
      check(Array.isArray(file.packetIds) && Array.isArray(file.receipts), `${file.path}: missing coverage arrays`);
      if (!Array.isArray(file.packetIds) || !Array.isArray(file.receipts)) continue;
      if (file.disposition !== pathPolicy(file.path).disposition) check(packets.has(file.classifiedBy) && packets.get(file.classifiedBy).executionClass !== "mechanical", `${file.path}: changed scope needs a strong classification owner`);
      for (const packetId of file.packetIds) {
        check(packets.has(packetId), `${file.path}: unknown packet ${packetId}`);
        check(packets.get(packetId)?.assignments?.some(assignment => assignment.path === file.path), `${file.path}: missing reciprocal packet assignment`);
      }
      const currentReceipts = file.receipts.filter(receipt => receipt.sha256 === file.sha256);
      if (file.receipts.length > 0 && currentReceipts.length === 0) warnings.push(`${file.path}: receipt needs revalidation`);
      for (const receipt of file.receipts) {
        check(file.packetIds.includes(receipt.packetId) && packets.has(receipt.packetId), `${file.path}: unassigned receipt`);
        check(shaPattern.test(receipt.sha256 ?? ""), `${file.path}: receipt has no fingerprint`);
        check(receiptMethods.has(receipt.method), `${file.path}: invalid receipt method`);
        check(typeof receipt.note === "string" && receipt.note.length > 0, `${file.path}: receipt needs an explicit reading account`);
        const isCurrent = receipt.sha256 === file.sha256;
        if (isCurrent && receipt.method === "full-text") check(file.kind !== "binary", `${file.path}: binary input cannot use a full-text receipt`);
        if (receipt.method === "visual") {
          check(receipt.extent === "whole-image", `${file.path}: visual receipt needs whole-image extent`);
          check(["strong", "strong-independent"].includes(packets.get(receipt.packetId)?.executionClass), `${file.path}: visual receipt needs a strong reviewer`);
          if (isCurrent) check(file.kind === "binary" && /\.png$/i.test(file.path), `${file.path}: visual receipt requires a binary PNG`);
        }
        if (receipt.method === "line-ranges") {
          check(Array.isArray(receipt.ranges) && receipt.ranges.length > 0, `${file.path}: missing read ranges`);
          for (const range of receipt.ranges ?? []) check(Array.isArray(range) && range.length === 2 && range.every(Number.isInteger) && range[0] >= 1 && range[0] <= range[1] && (!isCurrent || (Number.isInteger(file.lines) && range[1] <= file.lines)), `${file.path}: invalid read range`);
        }
        if (receipt.method === "json-pointers") {
          check(Array.isArray(receipt.pointers) && receipt.pointers.length > 0, `${file.path}: missing inspected JSON pointers`);
          for (const pointer of receipt.pointers ?? []) check(typeof pointer === "string" && (pointer === "" || /^\/(?:[^~]|~[01])*$/.test(pointer)), `${file.path}: invalid inspected JSON pointer`);
          if (checkDisk && isCurrent) {
            const current = snapshot(root, file.path, file);
            assert.ok(current.sha256 !== null && current.kind !== "symlink", "Inspected JSON must be a regular in-repository file");
            if (current.sha256 === receipt.sha256) {
              const document = JSON.parse(readFileSync(safePath(root, file.path), "utf8"));
              for (const pointer of receipt.pointers ?? []) jsonPointer(document, pointer);
            }
          }
        }
      }
      if (["read", "verified"].includes(file.status) && !file.stale) check(fullyRead(file), `${file.path}: partial/structural inspection cannot claim a full read`);
      if (file.status === "verified") {
        const verifier = packets.get(file.verificationPacketId);
        check(verifier?.executionClass === "strong-independent", `${file.path}: verification needs an independent packet`);
        check(file.packetIds.includes(file.verificationPacketId) && verifier?.assignments?.some(assignment => assignment.path === file.path), `${file.path}: verification needs reciprocal assignment`);
        check(currentReceipts.some(receipt => receipt.packetId === file.verificationPacketId && ["full-text", "line-ranges", "json-pointers", "visual"].includes(receipt.method)), `${file.path}: verification needs a current independent reading account`);
        check(["reviewed", "accepted"].includes(verifier?.status) && typeof verifier?.report === "string" && existsSync(safePath(root, verifier.report)), `${file.path}: verification needs a completed independent review`);
      }
      if (file.status === "inventoried") check(file.receipts.length === 0, `${file.path}: receipt exists but reading status was not updated`);
      if (file.stale) warnings.push(`${file.path}: stale inventory entry`);
      if (checkDisk && file.disposition !== "excluded") {
        const current = snapshot(root, file.path, file);
        if (current.sha256 !== file.sha256 || current.present !== file.present) warnings.push(`${file.path}: changed since inventory`);
      }
    } catch { errors.push(`${file.path}: invalid or inaccessible coverage data`); }
  }

  for (const claim of evidence.claims) {
    check(/^E\d{3,}$/.test(claim.id), `Invalid evidence ID: ${claim.id}`);
    check(claimKinds.has(claim.kind) && claimStates.has(claim.status), `${claim.id}: invalid evidence kind/status`);
    check(packets.has(claim.packetId), `${claim.id}: unknown evidence owner`);
    check(typeof claim.statement === "string" && claim.statement.length > 0, `${claim.id}: missing statement`);
    check(typeof claim.scope === "string" && claim.scope.length > 0, `${claim.id}: missing applicability scope`);
    check(Array.isArray(claim.limits) && claim.limits.length > 0, `${claim.id}: missing limitations`);
    check(Array.isArray(claim.sources) && claim.sources.length > 0, `${claim.id}: no original evidence`);
    for (const source of claim.sources ?? []) {
      try { inspectReference(source, claim.id); }
      catch { errors.push(`${claim.id}: invalid source reference`); }
    }
  }
  for (const dependency of coverage.dependencies) {
    check(typeof dependency.id === "string" && packets.has(dependency.fromPacket), "Dependency needs an ID and originating packet");
    check(["open", "assigned", "resolved"].includes(dependency.status), `${dependency.id}: invalid dependency status`);
    check(typeof dependency.question === "string" && dependency.question.length > 0, `${dependency.id}: missing deciding question`);
    if (dependency.status !== "open") check(packets.has(dependency.ownerPacket), `${dependency.id}: missing owner`);
  }
  if (enumeratedPaths) {
    for (const name of enumeratedPaths) if (!files.has(name) && pathPolicy(name).disposition !== "excluded") errors.push(`New unlisted file: ${name}`);
    const listed = new Set([...enumeratedPaths, ...LOCAL_INSTRUCTIONS]);
    for (const file of coverage.files) if (file.enumerated && file.disposition !== "excluded" && !listed.has(file.path)) warnings.push(`${file.path}: absent from current repository listing`);
  }
  const progress = summarize(coverage);
  const incomplete = coverage.files.some(file => file.disposition !== "excluded" && (file.disposition === "scope-pending" || file.stale || !file.present || !["read", "verified"].includes(file.status)));
  const accepted = coverage.packets.length > 0 && coverage.packets.every(packet => packet.status === "accepted");
  return { errors, warnings: [...new Set(warnings)], readyForSynthesis: errors.length === 0 && warnings.length === 0 && !incomplete && progress.openDependencies === 0 && accepted && evidence.claims.some(claim => claim.status === "supported") && enumeratedPaths !== undefined, progress };
}

function readJson(path) {
  try { return JSON.parse(readFileSync(path, "utf8")); }
  catch { throw new Error(`Cannot read valid JSON register: ${relative(ROOT, path)}`); }
}

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  const json = JSON.stringify(value, null, 2).replace(/[^\x00-\x7F]/g, character => `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`);
  writeFileSync(path, `${json}\n`);
}

function main() {
  const [command, ...args] = process.argv.slice(2);
  const coverageFile = safePath(ROOT, COVERAGE_PATH);
  const evidenceFile = safePath(ROOT, EVIDENCE_PATH);
  if (command === "inventory") {
    const headIndex = args.indexOf("--head");
    const head = headIndex >= 0 ? args[headIndex + 1] : undefined;
    const paths = readFileSync(0, "utf8").split("\0").filter(Boolean);
    const previous = existsSync(coverageFile) ? readJson(coverageFile) : undefined;
    const coverage = makeInventory(ROOT, paths, previous, { head });
    writeJson(coverageFile, coverage);
    if (!existsSync(evidenceFile)) writeJson(evidenceFile, { schemaVersion: 1, claims: [] });
    console.log(JSON.stringify(summarize(coverage), null, 2));
    return;
  }
  const coverage = readJson(coverageFile);
  if (command === "summary") console.log(JSON.stringify(summarize(coverage), null, 2));
  else if (command === "packet") {
    const packet = coverage.packets.find(item => item.id === args[0]);
    assert.ok(packet, "Unknown packet ID");
    console.log(JSON.stringify({ ...packet, files: coverage.files.filter(file => file.packetIds.includes(packet.id)).map(file => ({ path: file.path, sha256: file.sha256, status: file.status, stale: file.stale, receipts: file.receipts })) }, null, 2));
  } else if (command === "check") {
    const enumeratedPaths = args.includes("--enumerated") ? readFileSync(0, "utf8").split("\0").filter(Boolean) : undefined;
    const result = validateRegisters(ROOT, coverage, readJson(evidenceFile), { enumeratedPaths });
    console.log(JSON.stringify(result, null, 2));
    if (result.errors.length || (args.includes("--strict") && !result.readyForSynthesis)) process.exitCode = 1;
  } else throw new Error("Use inventory --head SHA (NUL paths on stdin), summary, packet PNN, or check [--enumerated] [--strict]");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}