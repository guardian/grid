import fs from "node:fs";
import path from "node:path";
import type { Readable } from "node:stream";
import { inspect, stripVTControlCharacters } from "node:util";

const OWNER_READ_WRITE = 0o600;
const OWNER_READ_WRITE_EXECUTE = 0o700;

export type StackDiagnostics = ReturnType<typeof createStackDiagnostics>;

export function formatDuration(seconds: number): string {
    if (seconds < 60) {
        return `${seconds.toFixed(1)}s`;
    }
    return `${Math.floor(seconds / 60)}m ${Math.floor(seconds % 60)}s`;
}

export function createStackDiagnostics(
    e2eRoot: string,
    {
        debug = process.env.E2E_DEBUG === "1",
    }: { debug?: boolean } = {},
) {
    const runId = new Date().toISOString().replace(/:/g, "-");
    const directory = path.join(e2eRoot, "target", "logs", runId);
    const secrets = new Set<string>();
    const reportedErrors = new Set<unknown>();
    const flushers = new Set<() => void>();
    let writeFailed = false;

    function addSecrets(values: readonly string[]): void {
        for (const value of values) {
            if (value) {
                secrets.add(value);
                for (const line of value.split(/\r?\n/).filter(Boolean)) {
                    secrets.add(line);
                }
            }
        }
    }

    addSecrets(Object.entries(process.env)
        .filter(([name]) => /TOKEN|SECRET|PASSWORD|PRIVATE_KEY/i.test(name))
        .map(([, value]) => value ?? ""));

    function redact(text: string): string {
        let safe = stripVTControlCharacters(text)
            .replace(/((?:set-cookie|cookie|authorization)\s*:\s*)[^\r\n]+/gi, "$1[REDACTED]")
            .replace(/(gutoolsAuth-assym=)[^;\s]+/g, "$1[REDACTED]")
            .replace(/\/oauthCallback\?[^\s"'<>]*/g, "/oauthCallback");

        for (const secret of [...secrets].sort((first, second) => second.length - first.length)) {
            safe = safe.split(secret).join("[REDACTED]");
        }

        return safe;
    }

    function append(file: string, text: string): void {
        try {
            fs.mkdirSync(path.dirname(file), { recursive: true, mode: OWNER_READ_WRITE_EXECUTE });
            fs.appendFileSync(file, text, { mode: OWNER_READ_WRITE });
        } catch (failure) {
            if (!writeFailed) {
                writeFailed = true;
                console.error(`Could not save diagnostics: ${redact(inspect(failure))}`);
            }
        }
    }

    function log(message: string): void {
        const safe = redact(message);

        append(path.join(directory, "stack.log"), `${new Date().toISOString()} ${safe}\n`);
        console.log(safe);
    }

    function error(
        name: string,
        failure: unknown,
        elapsedSeconds?: number,
    ): void {
        const details = reportedErrors.has(failure) ? "" : `\n${inspect(failure, { depth: 5 })}`;
        reportedErrors.add(failure);
        const duration = elapsedSeconds === undefined ? "" : ` [${formatDuration(elapsedSeconds)}]`;
        log(`${name.padEnd(24)} ${"FAILED".padEnd(7)}${duration}${details}`);
    }

    async function step<Result>(
        name: string,
        run: () => Promise<Result>,
    ): Promise<Result> {
        const started = performance.now();
        const label = name.padEnd(24);

        log(`${label} STARTED`);

        try {
            const result = await run();
            const duration = (performance.now() - started) / 1000;

            log(`${label} ${"DONE".padEnd(7)} [${formatDuration(duration)}]`);

            return result;
        } catch (failure) {
            const duration = (performance.now() - started) / 1000;

            error(name, failure, duration);
            throw failure;
        }
    }

    function capture(category: "builds" | "containers", name: string, stream: Readable): void {
        const file = path.join(directory, category, `${name}.log`);

        append(file, `${new Date().toISOString()} ${name} log attached\n`);
        if (stream.readableEncoding !== "utf8") {
            stream.setEncoding("utf8");
        }
        let pending = "";

        function write(line: string): void {
            const safe = redact(line);
            append(file, `${safe}\n`);
            if (debug) {
                process.stdout.write(`[${name}] ${safe}\n`);
            }
        }

        function flush(): void {
            if (pending) {
                write(pending);
                pending = "";
            }
        }

        function finish(): void {
            flush();
            flushers.delete(flush);
        }

        flushers.add(flush);
        stream.on("data", (chunk: string) => {
            pending += chunk;
            const lines = pending.split("\n");
            pending = lines.pop() ?? "";
            for (const line of lines) {
                write(line);
            }
        });
        stream.once("end", finish);
        stream.once("close", finish);
        stream.on("error", (failure) => error(`logs:${name}`, failure));
    }

    function flush(): void {
        for (const flushStream of flushers) {
            flushStream();
        }
    }

    log(`diagnostics: ${directory}`);
    return { runId, directory, log, error, step, capture, addSecrets, flush };
}
