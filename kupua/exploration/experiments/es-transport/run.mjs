import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { homedir, platform } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const directory = dirname(fileURLToPath(import.meta.url));
const artifacts = [
  ["org/elasticsearch/client", "elasticsearch-rest-client", "8.19.12"],
  ["org/apache/httpcomponents", "httpclient", "4.5.14"],
  ["org/apache/httpcomponents", "httpcore", "4.4.16"],
  ["org/apache/httpcomponents", "httpasyncclient", "4.1.5"],
  ["org/apache/httpcomponents", "httpcore-nio", "4.4.16"],
  ["commons-codec", "commons-codec", "1.15"],
  ["commons-logging", "commons-logging", "1.2"],
];
const cache = process.env.COURSIER_CACHE ?? (platform() === "darwin"
  ? join(homedir(), "Library/Caches/Coursier/v1")
  : join(homedir(), ".cache/coursier/v1"));
const cachedJar = ([group, artifact, version]) => {
  const suffix = `${group}/${artifact}/${version}/${artifact}-${version}.jar`;
  const jar = ["repo1.maven.org", "repo.maven.apache.org"]
    .map(host => join(cache, "https", host, "maven2", suffix)).find(existsSync);
  if (!jar) throw new Error(`Missing cached ${artifact}:${version}; no dependencies were downloaded.`);
  return jar;
};
const jars = artifacts.map(cachedJar);
const javaHome = process.env.JAVA_HOME;
if (!javaHome) throw new Error("Set JAVA_HOME to the JDK used by local media-api (JDK 11 in the captured failure).");
const build = mkdtempSync(join(directory, ".transport-build-"));
try {
  console.log("Local-only synthetic HTTP transport probe; no Elasticsearch, credentials or external URLs.");
  console.log("Pinned libraries:", artifacts.map(([, name, version]) => `${name}:${version}`).join(", "));
  execFileSync(join(javaHome, "bin/javac"), ["-cp", jars.join(delimiter), "-d", build,
    join(directory, "HttpTransportProbe.java"), join(directory, "TransportObserver.java"),
    join(directory, "DiagnosticControls.java"), join(directory, "LocalTransportDiagnostics.java"),
    join(directory, "CaptureLimits.java")],
    { stdio: "inherit", timeout: 30_000 });
  const args = process.argv.slice(2);
  if (args.length > 1 || args.some(arg => !["--controls-only", "--integration-only", "--limits-only"].includes(arg))) {
    throw new Error("Use --controls-only, --integration-only, --limits-only, or no selector.");
  }
  const cases = args.includes("--integration-only") || args.includes("--limits-only") ? []
    : args.includes("--controls-only") ? ["DiagnosticControls"] : ["HttpTransportProbe", "DiagnosticControls"];
  for (const main of cases) {
    execFileSync(join(javaHome, "bin/java"), ["-cp", [build, ...jars].join(delimiter), main],
      { stdio: "inherit", timeout: 90_000 });
  }
  execFileSync(join(javaHome, "bin/java"), ["-cp", [build, ...jars].join(delimiter),
    "com.gu.mediaservice.lib.elasticsearch.diagnostics.CaptureLimits", build],
    { stdio: "inherit", timeout: 15_000 });
  if (args.includes("--integration-only")) {
    const root = join(directory, "../../../..");
    const shared = join(root, "common-lib");
    const sources = ["ElasticSearchClient.scala", "ElasticSearchExecutions.scala"].map(name =>
      join(shared, "src/main/scala/com/gu/mediaservice/lib/elasticsearch", name));
    for (const name of ["TransportObserver.java", "LocalTransportDiagnostics.java"]) {
      const installed = join(shared, "src/main/java/com/gu/mediaservice/lib/elasticsearch/diagnostics", name);
      if (!existsSync(installed) || readFileSync(installed, "utf8") !== readFileSync(join(directory, name), "utf8")) {
        throw new Error(`Temporary shared ${name} must exactly match the locally tested source.`);
      }
    }
    const exported = join(root, "media-api/target/streams/compile/dependencyClasspath/_global/streams/export");
    if (!existsSync(exported)) throw new Error("Existing media-api dependency metadata is required; no sbt or download is started.");
    const dependencies = readFileSync(exported, "utf8").trim().split(delimiter);
    const integrationArtifacts = artifacts.map(([group, artifact, version]) =>
      [group, artifact, artifact === "commons-codec" ? "1.17.2" : version]);
    for (const [, artifact, version] of integrationArtifacts) {
      if (!dependencies.some(path => path.endsWith(`/${artifact}-${version}.jar`))) {
        throw new Error(`Existing media-api classpath does not match ${artifact}:${version}.`);
      }
    }
    console.log("Integration uses cached media-api classpath: transport versions as above; commons-codec 1.17.2 (not fixture 1.15).");
    const classes = join(shared, "target/scala-2.13/classes");
    if (![classes, ...dependencies].every(existsSync)) throw new Error("Existing common-lib classes/dependencies are missing.");
    const compiler = ["scala-compiler", "scala-library", "scala-reflect"].map(name => cachedJar(["org/scala-lang", name, "2.13.18"]));
    const classpath = [build, classes, ...dependencies].join(delimiter);
    execFileSync(join(javaHome, "bin/java"), ["-cp", compiler.join(delimiter), "scala.tools.nsc.Main",
      "-classpath", classpath, "-d", build, ...sources, join(directory, "IntegrationProbe.scala")],
      { stdio: "inherit", timeout: 90_000 });
    const logging = join(build, "silent-logback.xml");
    writeFileSync(logging, '<configuration><root level="OFF"/></configuration>');
    for (const mode of ["disabled", "non-loopback", "existing-file", "enabled"]) {
      const capture = join(build, `${mode}.log`);
      const env = { ...process.env };
      delete env.KUPUA_ES_TRANSPORT_DIAGNOSTICS_FILE;
      if (mode !== "disabled") env.KUPUA_ES_TRANSPORT_DIAGNOSTICS_FILE = capture;
      execFileSync(join(javaHome, "bin/java"), [`-Dlogback.configurationFile=${logging}`, "-cp", classpath,
        "IntegrationProbe", mode, capture], { stdio: "inherit", timeout: 45_000, env });
    }
  }
} finally {
  rmSync(build, { recursive: true, force: true });
}
