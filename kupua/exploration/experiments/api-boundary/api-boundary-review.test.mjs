import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import {
  digest,
  jsonPointer,
  makeInventory,
  pathPolicy,
  REVIEW_DIR,
  safePath,
  snapshot,
  summarize,
  validateRegisters,
} from "./api-boundary-review.mjs";

const head = "a".repeat(40);

function fixture(context) {
  const root = mkdtempSync(join(import.meta.dirname, ".registry-test-"));
  context.after(() => rmSync(root, { recursive: true, force: true }));
  const write = (path, content) => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  };
  return { root, write };
}

function packet(id = "P01", executionClass = "strong") {
  return { id, title: "Fixture review", question: "Does the fixture preserve its declared contract?", executionClass, status: "ready", assignments: [{ path: "kupua/src/example.ts", scope: "Full file" }], report: `${REVIEW_DIR}/api-boundary-09-${id.toLowerCase()}-fixture.md` };
}

function reviewedFixture(context) {
  const { root, write } = fixture(context);
  write("kupua/src/example.ts", "first\nsecond\nthird\n");
  const coverage = makeInventory(root, ["kupua/src/example.ts"], undefined, { head });
  coverage.packets.push(packet());
  const file = coverage.files[0];
  file.packetIds.push("P01");
  return { root, write, coverage, file, evidence: { schemaVersion: 1, claims: [] } };
}

function acceptedFixture(context) {
  const result = reviewedFixture(context);
  const { write, coverage, file, evidence } = result;
  file.status = "read";
  file.receipts.push({ packetId: "P01", sha256: file.sha256, method: "full-text", note: "Complete fixture read and accepted." });
  write(coverage.packets[0].report, "# Reviewed fixture\n");
  coverage.packets[0].status = "accepted";
  evidence.claims.push({ id: "E001", packetId: "P01", kind: "source", status: "supported", statement: "Fixture has a first line.", scope: "Synthetic fixture only.", limits: ["Not application acceptance."], sources: [{ path: file.path, sha256: file.sha256, lines: [1, 1] }] });
  return result;
}

function visualFixture(context, imagePath = "kupua/baseline.png") {
  const result = acceptedFixture(context);
  result.write(imagePath, Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64"));
  const coverage = makeInventory(result.root, [result.file.path, imagePath], result.coverage, { head });
  const image = coverage.files.find(file => file.path === imagePath);
  coverage.packets[0].assignments.push({ path: imagePath, scope: "Whole synthetic image; not a real application review." });
  image.packetIds.push("P01");
  image.status = "read";
  const receipt = { packetId: "P01", sha256: image.sha256, method: "visual", extent: "whole-image", note: "Whole synthetic image inspection declaration; not actual application coverage." };
  image.receipts.push(receipt);
  const validate = () => validateRegisters(result.root, coverage, result.evidence, { enumeratedPaths: coverage.files.map(file => file.path) });
  return { ...result, coverage, image, receipt, validate };
}

test("whole-image PNG receipts support reading without bypassing packet completion", context => {
  const { coverage, validate } = visualFixture(context);
  assert.deepEqual(validate().errors, []);
  assert.equal(validate().readyForSynthesis, true);
  coverage.packets[0].status = "ready";
  assert.equal(validate().readyForSynthesis, false);
});

for (const extent of [undefined, "region"]) {
  test(`visual receipt requires explicit whole-image extent, not ${extent}`, context => {
    const { receipt, validate } = visualFixture(context);
    receipt.extent = extent;
    assert.ok(validate().errors.some(message => message.includes("visual receipt needs whole-image extent")));
    assert.equal(validate().readyForSynthesis, false);
  });
}

test("mechanical extraction cannot supply a visual reading receipt", context => {
  const { coverage, validate } = visualFixture(context);
  coverage.packets[0].executionClass = "mechanical";
  assert.ok(validate().errors.some(message => message.includes("visual receipt needs a strong reviewer")));
});

test("visual receipt cannot substitute for text or opaque non-PNG review", context => {
  const other = visualFixture(context, "kupua/profile.icc");
  assert.ok(other.validate().errors.some(message => message.includes("visual receipt requires a binary PNG")));
  const { root, write, image, receipt, validate } = visualFixture(context);
  write(image.path, "plain text\n");
  Object.assign(image, snapshot(root, image.path, image));
  receipt.sha256 = image.sha256;
  assert.ok(validate().errors.some(message => message.includes("visual receipt requires a binary PNG")));
});

test("binary metadata and fake full-text receipts cannot close visual coverage", context => {
  const { receipt, validate } = visualFixture(context);
  receipt.method = "structural";
  assert.ok(validate().errors.some(message => message.includes("cannot claim a full read")));
  assert.equal(validate().readyForSynthesis, false);
  receipt.method = "full-text";
  assert.ok(validate().errors.some(message => message.includes("binary input cannot use a full-text receipt")));
  assert.equal(validate().readyForSynthesis, false);
});

test("visual receipts still require current fingerprints and an explicit account", context => {
  const { image, receipt, validate } = visualFixture(context);
  receipt.sha256 = "b".repeat(64);
  assert.equal(validate().readyForSynthesis, false);
  assert.ok(validate().warnings.some(message => message.includes("needs revalidation")));
  receipt.sha256 = image.sha256;
  receipt.note = "";
  assert.ok(validate().errors.some(message => message.includes("explicit reading account")));
});

test("visual revalidation retains historical image receipts", context => {
  const { root, write, coverage, file, image, receipt, evidence } = visualFixture(context);
  const previous = structuredClone(receipt);
  write(image.path, Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 1]));
  const refreshed = makeInventory(root, [file.path, image.path], coverage, { head });
  const current = refreshed.files.find(item => item.path === image.path);
  const validate = () => validateRegisters(root, refreshed, evidence, { enumeratedPaths: refreshed.files.map(item => item.path) });
  assert.equal(validate().readyForSynthesis, false);
  current.receipts.push({ ...previous, sha256: current.sha256, note: "Whole replacement image inspected in this synthetic declaration." });
  current.stale = false;
  assert.deepEqual(current.receipts[0], previous);
  assert.deepEqual(validate().errors, []);
  assert.deepEqual(validate().warnings, []);
  assert.equal(validate().readyForSynthesis, true);
});

test("file-specific independent visual verification needs its own current receipt and report", context => {
  const { root, write, coverage, image, receipt, validate } = visualFixture(context);
  const verifier = packet("P02", "strong-independent");
  verifier.assignments = [{ path: image.path, scope: "Independent whole-image review." }];
  verifier.status = "accepted";
  coverage.packets.push(verifier);
  image.packetIds.push(verifier.id);
  image.status = "verified";
  image.verificationPacketId = verifier.id;
  write(verifier.report, "# Independent synthetic visual review\n");
  assert.ok(validate().errors.some(message => message.includes("current independent reading account")));
  image.receipts.push({ ...receipt, packetId: verifier.id });
  assert.deepEqual(validate().errors, []);
  assert.equal(validate().readyForSynthesis, true);
  rmSync(join(root, verifier.report));
  assert.ok(validate().errors.some(message => message.includes("completed independent review")));
});

test("path policy never silently excludes unfamiliar first-party Grid code", () => {
  assert.equal(pathPolicy("kupua/src/main.tsx").disposition, "review-required");
  assert.equal(pathPolicy("media-api/app/controllers/MediaApi.scala").disposition, "review-required");
  assert.equal(pathPolicy("common-lib/src/Filters.scala").disposition, "scope-pending");
  assert.equal(pathPolicy("thrall/app/Migration.scala").disposition, "scope-pending");
  assert.equal(pathPolicy("kupua/exploration/docs/zz Archive/old-plan.md").disposition, "review-required");
  assert.equal(pathPolicy("kupua/e2e-perf/results/perceived-log.json").disposition, "review-required");
});

test("administration and generated output have explicit exclusions", () => {
  for (const name of [`${REVIEW_DIR}/api-boundary-06-coverage.json`, "kupua/exploration/docs/worklog-current.md", "media-api/target/output.log", "kupua/test-results/trace.zip", "kupua/.env.local"]) {
    const policy = pathPolicy(name);
    assert.equal(policy.disposition, "excluded");
    assert.ok(policy.reason.length > 0);
  }
  assert.equal(pathPolicy(`${REVIEW_DIR}/api-boundary-02-code-first-findings.md`).disposition, "review-required");
});

test("paths cannot escape or use ambiguous normalization", () => {
  for (const path of ["../outside", "/absolute", "kupua/../outside", "kupua\\file", "./kupua/file", ""]) assert.throws(() => safePath(import.meta.dirname, path));
});

test("inventory is sorted and unique, and starts genuinely unread", context => {
  const { root, write } = fixture(context);
  write("kupua/src/example.ts", "one\ntwo\n");
  write("common-lib/example.scala", "source\n");
  const coverage = makeInventory(root, ["kupua/src/example.ts", "common-lib/example.scala", "kupua/src/example.ts"], undefined, { head });
  assert.equal(coverage.files.length, 2);
  assert.equal(coverage.files[0].path, "common-lib/example.scala");
  assert.equal(coverage.files[1].lines, 2);
  assert.equal(coverage.files[1].sha256, digest("one\ntwo\n"));
  assert.ok(coverage.files.every(file => file.status === "inventoried" && file.receipts.length === 0));
  assert.equal(summarize(coverage).unassigned, 1);
});

test("inventory rejects empty listings and invalid revisions", context => {
  const { root } = fixture(context);
  assert.throws(() => makeInventory(root, [], undefined, { head }));
  assert.throws(() => makeInventory(root, ["kupua/missing.ts"], undefined, { head: "unknown" }));
});

test("excluded sensitive payloads are not fingerprinted or copied", context => {
  const { root, write } = fixture(context);
  write("kupua/.env", "synthetic-private-content");
  const coverage = makeInventory(root, ["kupua/.env"], undefined, { head });
  assert.equal(coverage.files[0].sha256, null);
  assert.equal(JSON.stringify(coverage).includes("synthetic-private-content"), false);
});

test("missing tracked files and symlinks remain visible without following targets", context => {
  const { root, write } = fixture(context);
  write("kupua/target.txt", "target");
  symlinkSync("target.txt", join(root, "kupua/link.txt"));
  const coverage = makeInventory(root, ["kupua/missing.ts", "kupua/link.txt"], undefined, { head });
  assert.equal(coverage.files.find(file => file.path.endsWith("missing.ts")).present, false);
  assert.equal(coverage.files.find(file => file.path.endsWith("link.txt")).kind, "symlink");
  assert.equal(coverage.files.find(file => file.path.endsWith("link.txt")).sha256, null);
});

test("refresh preserves assignments, receipts and scope while marking change stale", context => {
  const { root, write, coverage, file } = reviewedFixture(context);
  file.status = "read";
  file.receipts.push({ packetId: "P01", sha256: file.sha256, method: "full-text", note: "Read the complete fixture." });
  write(file.path, "changed\n");
  const refreshed = makeInventory(root, [file.path], coverage, { head: "b".repeat(40) });
  assert.equal(refreshed.files[0].stale, true);
  assert.equal(refreshed.files[0].status, "read");
  assert.deepEqual(refreshed.files[0].receipts, file.receipts);
  assert.deepEqual(refreshed.packets, coverage.packets);
  assert.equal(refreshed.baseline.initialHead, head);
  assert.equal(refreshed.baseline.inventoryHead, "b".repeat(40));
});

test("refresh does not erase a path missing from enumeration", context => {
  const { root, write, coverage, file } = reviewedFixture(context);
  write("kupua/other.ts", "other");
  const refreshed = makeInventory(root, ["kupua/other.ts"], coverage, { head });
  const retained = refreshed.files.find(item => item.path === file.path);
  assert.equal(retained.enumerated, false);
  assert.equal(retained.stale, true);
});

test("partial reading cannot become a full-read claim", context => {
  const { root, coverage, file, evidence } = reviewedFixture(context);
  file.status = "read";
  file.receipts.push({ packetId: "P01", sha256: file.sha256, method: "line-ranges", ranges: [[1, 1]], note: "Only the first line." });
  const result = validateRegisters(root, coverage, evidence);
  assert.ok(result.errors.some(message => message.includes("cannot claim a full read")));
  assert.equal(result.readyForSynthesis, false);
});

test("full non-overlapping line coverage supports a read, but not independent verification", context => {
  const { root, coverage, file, evidence } = reviewedFixture(context);
  file.status = "read";
  file.receipts.push({ packetId: "P01", sha256: file.sha256, method: "line-ranges", ranges: [[1, 1], [2, 3]], note: "All lines read in two chunks." });
  assert.deepEqual(validateRegisters(root, coverage, evidence).errors, []);
  file.status = "verified";
  assert.ok(validateRegisters(root, coverage, evidence).errors.some(message => message.includes("independent packet")));
});

test("structural inspection cannot masquerade as semantic full reading", context => {
  const { root, coverage, file, evidence } = reviewedFixture(context);
  file.status = "read";
  file.receipts.push({ packetId: "P01", sha256: file.sha256, method: "structural", note: "Counted lines, not interpreted content." });
  assert.ok(validateRegisters(root, coverage, evidence).errors.some(message => message.includes("cannot claim a full read")));
});

test("evidence requires original source, applicability and limitations", context => {
  const { root, coverage, file, evidence } = reviewedFixture(context);
  evidence.claims.push({ id: "E001", packetId: "P01", kind: "source", status: "supported", statement: "Fixture has three lines.", scope: "Synthetic input only.", limits: ["Not a product behavior test."], sources: [{ path: file.path, sha256: file.sha256, lines: [1, 3] }] });
  assert.deepEqual(validateRegisters(root, coverage, evidence).errors, []);
  evidence.claims[0].sources[0].lines = [1, 100];
  assert.ok(validateRegisters(root, coverage, evidence).errors.some(message => message.includes("invalid source lines")));
  evidence.claims[0].limits = [];
  assert.ok(validateRegisters(root, coverage, evidence).errors.some(message => message.includes("missing limitations")));
});

test("JSON pointers use own properties and standard escaping", () => {
  const source = { entries: [{ "a/b": { "~name": 7 } }] };
  assert.equal(jsonPointer(source, "/entries/0/a~1b/~0name"), 7);
  assert.throws(() => jsonPointer(source, "/entries/2"));
  assert.throws(() => jsonPointer(source, "/constructor"));
});

test("new files cannot be hidden from a coverage check", context => {
  const { root, coverage, file, evidence } = reviewedFixture(context);
  const result = validateRegisters(root, coverage, evidence, { enumeratedPaths: [file.path, "common-lib/new.scala"] });
  assert.ok(result.errors.includes("New unlisted file: common-lib/new.scala"));
  assert.equal(result.readyForSynthesis, false);
});

test("stale sources are explicit and block synthesis without destroying evidence", context => {
  const { root, write, coverage, file, evidence } = reviewedFixture(context);
  evidence.claims.push({ id: "E001", packetId: "P01", kind: "source", status: "supported", statement: "First line exists.", scope: "Original fixture.", limits: ["Historical source fact."], sources: [{ path: file.path, sha256: file.sha256, lines: [1, 1] }] });
  write(file.path, "updated\n");
  const result = validateRegisters(root, coverage, evidence);
  assert.ok(result.warnings.some(message => message.includes("stale source")));
  assert.equal(evidence.claims.length, 1);
  assert.equal(result.readyForSynthesis, false);
});

test("scope changes require a strong classification owner", context => {
  const { root, coverage, file, evidence } = reviewedFixture(context);
  file.disposition = "excluded";
  file.reason = "A reviewer must justify this.";
  assert.ok(validateRegisters(root, coverage, evidence).errors.some(message => message.includes("strong classification owner")));
});

test("a symlinked ancestor cannot redirect reading outside the inventory root", context => {
  const { root, write } = fixture(context);
  write("outside/file.ts", "outside");
  mkdirSync(join(root, "inside"));
  symlinkSync("../outside", join(root, "inside/link"));
  assert.throws(() => snapshot(join(root, "inside"), "link/file.ts", { disposition: "review-required" }));
});

test("a completed packet needs its actual report, not a status label", context => {
  const { root, coverage, evidence } = reviewedFixture(context);
  coverage.packets[0].status = "reviewed";
  assert.ok(validateRegisters(root, coverage, evidence).errors.some(message => message.includes("has no report")));
});

test("the designated independent candidate challenge keeps ordinary completion gates", context => {
  const { root, write, coverage, file, evidence } = acceptedFixture(context);
  const challenge = coverage.packets[0];
  challenge.role = "candidate-challenge";
  challenge.executionClass = "strong-independent";
  challenge.report = `${REVIEW_DIR}/api-boundary-12-plan-challenge.md`;
  challenge.status = "ready";
  const validate = () => validateRegisters(root, coverage, evidence, { enumeratedPaths: [file.path] });
  assert.deepEqual(validate().errors, []);
  assert.equal(validate().readyForSynthesis, false);
  challenge.status = "accepted";
  assert.ok(validate().errors.some(message => message.includes("has no report")));
  write(challenge.report, "# Independent candidate challenge\n");
  assert.deepEqual(validate().errors, []);
  assert.equal(validate().readyForSynthesis, true);
});

for (const [label, overrides] of [
  ["missing role", { role: undefined }],
  ["ordinary review role", { role: "review" }],
  ["non-independent class", { executionClass: "strong" }],
  ["mechanical class", { executionClass: "mechanical" }],
  ["another challenge filename", { report: `${REVIEW_DIR}/api-boundary-12-other.md` }],
  ["integration report", { report: `${REVIEW_DIR}/api-boundary-10-integration-review.md` }],
  ["candidate plan", { report: `${REVIEW_DIR}/api-boundary-11-candidate-plan.md` }],
]) {
  test(`challenge-report exception rejects ${label}`, context => {
    const { root, coverage, evidence } = reviewedFixture(context);
    Object.assign(coverage.packets[0], {
      role: "candidate-challenge",
      executionClass: "strong-independent",
      report: `${REVIEW_DIR}/api-boundary-12-plan-challenge.md`,
    }, overrides);
    assert.ok(validateRegisters(root, coverage, evidence).errors.some(message => message.includes("report outside packet series")));
  });
}

test("full reading cannot declare synthesis ready before packet acceptance", context => {
  const { root, coverage, file, evidence } = reviewedFixture(context);
  file.status = "read";
  file.receipts.push({ packetId: "P01", sha256: file.sha256, method: "full-text", note: "Complete fixture read, packet not yet accepted." });
  assert.equal(validateRegisters(root, coverage, evidence).readyForSynthesis, false);
});

test("evidence references do not follow a replaced source symlink", context => {
  const { root, write, coverage, file, evidence } = reviewedFixture(context);
  write("other.txt", "first\nsecond\nthird\n");
  rmSync(join(root, file.path));
  symlinkSync("../../other.txt", join(root, file.path));
  evidence.claims.push({ id: "E001", packetId: "P01", kind: "source", status: "supported", statement: "Fixture text.", scope: "Original regular file.", limits: ["No symlink traversal authorized."], sources: [{ path: file.path, sha256: file.sha256, lines: [1, 1] }] });
  assert.ok(validateRegisters(root, coverage, evidence).errors.some(message => message.includes("invalid source reference")));
});

test("packet assignments and file ownership must agree", context => {
  const { root, coverage, file, evidence } = reviewedFixture(context);
  file.packetIds = [];
  assert.ok(validateRegisters(root, coverage, evidence).errors.some(message => message.includes("reciprocal")));
});

test("synthesis needs accepted packets, original evidence and a fresh enumeration", context => {
  const { root, coverage, file, evidence } = acceptedFixture(context);
  assert.equal(validateRegisters(root, coverage, evidence).readyForSynthesis, false);
  assert.equal(validateRegisters(root, coverage, evidence, { enumeratedPaths: [file.path] }).readyForSynthesis, true);
  assert.equal(validateRegisters(root, coverage, { schemaVersion: 1, claims: [] }, { enumeratedPaths: [file.path] }).readyForSynthesis, false);
});

for (const status of ["unverified", "disputed", "refuted", "superseded"]) {
  test(`unsupported-only ${status} evidence cannot make synthesis ready`, context => {
    const { root, coverage, file, evidence } = acceptedFixture(context);
    evidence.claims[0].status = status;
    const result = validateRegisters(root, coverage, evidence, { enumeratedPaths: [file.path] });
    assert.deepEqual(result.errors, []);
    assert.equal(result.readyForSynthesis, false);
    evidence.claims.push({ ...evidence.claims[0], id: "E002", status: "supported" });
    assert.equal(validateRegisters(root, coverage, evidence, { enumeratedPaths: [file.path] }).readyForSynthesis, true);
  });
}

test("completed revalidation retains historical receipts after a file shrinks", context => {
  const { root, write, coverage, file, evidence } = acceptedFixture(context);
  file.receipts.push({ packetId: "P01", sha256: file.sha256, method: "line-ranges", ranges: [[1, 3]], note: "Original three-line version read." });
  const historicalReceipts = structuredClone(file.receipts);
  write(file.path, "changed\n");
  const refreshed = makeInventory(root, [file.path], coverage, { head });
  const current = refreshed.files[0];
  evidence.claims[0].sources[0].sha256 = current.sha256;
  const validate = () => validateRegisters(root, refreshed, evidence, { enumeratedPaths: [file.path] });
  assert.equal(validate().readyForSynthesis, false);
  current.stale = false;
  assert.equal(validate().readyForSynthesis, false);
  current.receipts.push({ packetId: "P01", sha256: current.sha256, method: "line-ranges", ranges: [[1, 1]], note: "Read the complete shortened version and rechecked the first-line claim." });
  assert.deepEqual(current.receipts.slice(0, 2), historicalReceipts);
  assert.deepEqual(validate().errors, []);
  assert.deepEqual(validate().warnings, []);
  assert.equal(validate().readyForSynthesis, true);
  current.receipts[1].ranges = [[0, 3]];
  assert.ok(validate().errors.some(message => message.includes("invalid read range")));
});

test("historical JSON selectors keep structural checks without resolving against new content", context => {
  const { root, write, coverage, file, evidence } = acceptedFixture(context);
  write(file.path, '{"old":{"value":1}}\n');
  const previous = makeInventory(root, [file.path], coverage, { head });
  previous.files[0].receipts.push({ packetId: "P01", sha256: previous.files[0].sha256, method: "json-pointers", pointers: ["/old/value"], note: "Read the old value." });
  write(file.path, '{"current":1}\n');
  const refreshed = makeInventory(root, [file.path], previous, { head });
  const current = refreshed.files[0];
  current.stale = false;
  current.receipts.push({ packetId: "P01", sha256: current.sha256, method: "full-text", note: "Read the complete replacement JSON." });
  current.receipts.push({ packetId: "P01", sha256: current.sha256, method: "json-pointers", pointers: ["/current"], note: "Rechecked the current value." });
  evidence.claims[0].sources[0].sha256 = current.sha256;
  const validate = () => validateRegisters(root, refreshed, evidence, { enumeratedPaths: [file.path] });
  assert.deepEqual(validate().errors, []);
  assert.deepEqual(validate().warnings, []);
  assert.equal(validate().readyForSynthesis, true);
  current.receipts[1].pointers = ["invalid-pointer"];
  assert.ok(validate().errors.some(message => message.includes("invalid inspected JSON pointer")));
  current.receipts[1].pointers = ["/old/value"];
  current.receipts[3].pointers = ["/missing"];
  assert.ok(validate().errors.length > 0);
});

function verifiedFixture(context) {
  const result = acceptedFixture(context);
  const { coverage, file, write } = result;
  const verifier = packet("P02", "strong-independent");
  verifier.status = "reviewed";
  coverage.packets.push(verifier);
  file.packetIds.push(verifier.id);
  file.status = "verified";
  file.verificationPacketId = verifier.id;
  file.receipts.push({ packetId: verifier.id, sha256: file.sha256, method: "line-ranges", ranges: [[1, 1]], note: "Independently checked the decisive first-line claim against its original." });
  write(verifier.report, "# Independent first-line check\n");
  return { ...result, verifier };
}

test("verified allows a completed independent check scoped to decisive claims", context => {
  const { root, coverage, evidence } = verifiedFixture(context);
  assert.deepEqual(validateRegisters(root, coverage, evidence).errors, []);
});

test("verified rejects an unrelated independent assignment", context => {
  const { root, write, coverage, file, evidence, verifier } = verifiedFixture(context);
  write("kupua/other.ts", "other\n");
  const refreshed = makeInventory(root, [file.path, "kupua/other.ts"], coverage, { head });
  verifier.assignments = [{ path: "kupua/other.ts", scope: "Full file" }];
  refreshed.files.find(item => item.path === "kupua/other.ts").packetIds.push(verifier.id);
  const current = refreshed.files.find(item => item.path === file.path);
  current.packetIds = ["P01"];
  current.receipts = current.receipts.filter(receipt => receipt.packetId === "P01");
  const result = validateRegisters(root, refreshed, evidence);
  assert.ok(result.errors.some(message => message.includes("verification needs reciprocal assignment")));
});

for (const missing of ["receipt", "current-fingerprint", "semantic-reading", "completed-status", "report"]) {
  test(`verified rejects a verifier missing ${missing}`, context => {
    const { root, coverage, file, evidence, verifier } = verifiedFixture(context);
    if (missing === "receipt") file.receipts.pop();
    if (missing === "current-fingerprint") file.receipts[1].sha256 = "b".repeat(64);
    if (missing === "semantic-reading") file.receipts[1].method = "structural";
    if (missing === "completed-status") verifier.status = "ready";
    if (missing === "report") rmSync(join(root, verifier.report));
    const result = validateRegisters(root, coverage, evidence);
    const expected = ["completed-status", "report"].includes(missing) ? "verification needs a completed independent review" : "verification needs a current independent reading account";
    assert.ok(result.errors.some(message => message.includes(expected)));
  });
}