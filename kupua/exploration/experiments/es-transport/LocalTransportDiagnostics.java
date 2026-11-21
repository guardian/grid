package com.gu.mediaservice.lib.elasticsearch.diagnostics;

import java.io.BufferedWriter;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicLong;
import org.apache.http.HttpHost;
import org.apache.http.impl.nio.client.HttpAsyncClientBuilder;

/** Temporary local-only capture. This never reads a request body, URL or application log. */
public final class LocalTransportDiagnostics {
    private static final String SETTING = "KUPUA_ES_TRANSPORT_DIAGNOSTICS_FILE";
    private static final long MAX_BYTES = 8 * 1024 * 1024;
    private static final long MAX_SECONDS = 0; // Zero disables the recording deadline, not application timeouts.
    private static final ThreadLocal<Long> CURRENT = new ThreadLocal<>();
    private static volatile Capture capture;
    private static boolean attempted;

    private LocalTransportDiagnostics() { }

    public static HttpAsyncClientBuilder configure(HttpAsyncClientBuilder builder, HttpHost[] hosts) {
        String destination = System.getenv(SETTING);
        if (destination == null || destination.isEmpty()) return builder;
        for (HttpHost host : hosts) {
            String name = host.getHostName();
            if (!(name.equals("127.0.0.1") || name.equals("localhost") || name.equals("::1") || name.equals("[::1]"))) {
                System.err.println("KUPUA_ES_DIAG: not enabled; non-loopback client");
                return builder;
            }
        }
        if (hosts.length == 0) return builder;
        synchronized (LocalTransportDiagnostics.class) {
            if (!attempted) {
                attempted = true;
                try {
                    Path path = Paths.get(destination);
                    if (!path.isAbsolute()) throw new IOException("absolute capture path required");
                    capture = new Capture(path, MAX_BYTES, MAX_SECONDS);
                    Runtime.getRuntime().addShutdownHook(new Thread(LocalTransportDiagnostics::stop, "transport-capture-shutdown"));
                    System.err.println("KUPUA_ES_DIAG: enabled; metadata only; no time limit; 8 MiB size cap");
                } catch (IOException | RuntimeException error) {
                    System.err.println("KUPUA_ES_DIAG: not enabled; capture unavailable (existing files are never overwritten)");
                }
            }
        }
        Capture active = capture;
        return active == null ? builder : active.observer.install(builder);
    }

    private enum Kind { SEARCH_AFTER, IMAGE_RANK, IMAGE_WINDOW, IMAGE_KEYS, IMAGE_COUNT, IMAGE_AGGREGATIONS,
        IMAGE_MGET, SORT_PROFILE, OTHER }
    private enum Stage { BEGIN, SUBMISSION_END, SUCCESS, FAILED }
    private static Kind category(String message) {
        if (message == null) return Kind.OTHER;
        switch (message) {
            case "search-after": return Kind.SEARCH_AFTER;
            case "image-rank": return Kind.IMAGE_RANK;
            case "image-window": return Kind.IMAGE_WINDOW;
            case "image-keys": return Kind.IMAGE_KEYS;
            case "image-count": return Kind.IMAGE_COUNT;
            case "image-aggregations": return Kind.IMAGE_AGGREGATIONS;
            case "image-mget": return Kind.IMAGE_MGET;
            case "sort-profile": return Kind.SORT_PROFILE;
            default: return Kind.OTHER;
        }
    }

    public static Scope begin(String message) {
        Capture active = capture;
        if (active == null || !active.accepting) return Scope.NONE;
        Long previous = CURRENT.get();
        Scope scope = new Scope(active, active.nextOperation.incrementAndGet(), category(message), previous);
        CURRENT.set(scope.id);
        scope.record(Stage.BEGIN);
        return scope;
    }

    public static final class Scope implements AutoCloseable {
        private static final Scope NONE = new Scope(null, 0, Kind.OTHER, null);
        private final Capture owner;
        private final long id;
        private final Kind kind;
        private final Long previous;
        private Scope(Capture owner, long id, Kind kind, Long previous) {
            this.owner = owner; this.id = id; this.kind = kind; this.previous = previous;
        }
        public boolean isActive() { return owner != null; }
        public long id() { return id; }
        private void record(Stage stage) {
            if (owner != null) owner.offer(new Operation(owner.observer.elapsedNanos(), id, kind, stage));
        }
        @Override public void close() {
            if (owner == null) return;
            if (previous == null) CURRENT.remove(); else CURRENT.set(previous);
            record(Stage.SUBMISSION_END);
        }
        public void completed(boolean success) { record(success ? Stage.SUCCESS : Stage.FAILED); }
    }

    private static final class Operation {
        final long elapsed, id;
        final Kind kind;
        final Stage stage;
        Operation(long elapsed, long id, Kind kind, Stage stage) {
            this.elapsed = elapsed; this.id = id; this.kind = kind; this.stage = stage;
        }
        String line() { return "OP " + elapsed + " " + id + " " + kind + " " + stage; }
    }

    static final class Capture implements AutoCloseable {
        final ArrayBlockingQueue<Object> queue = new ArrayBlockingQueue<>(4096);
        final AtomicLong nextOperation = new AtomicLong(), dropped = new AtomicLong();
        final TransportObserver observer;
        final BufferedWriter writer;
        final Thread worker;
        final long limit, duration;
        volatile boolean accepting = true;
        Capture(Path file, long limit, long seconds) throws IOException {
            this.limit = limit; this.duration = TimeUnit.SECONDS.toNanos(seconds);
            writer = Files.newBufferedWriter(file, StandardCharsets.US_ASCII, StandardOpenOption.CREATE_NEW,
                StandardOpenOption.WRITE, LinkOption.NOFOLLOW_LINKS);
            observer = new TransportObserver(4096, 256, () -> {
                Long id = CURRENT.get();
                return id == null ? 0 : id;
            }, this::offer);
            worker = new Thread(this::drain, "local-transport-metadata");
            worker.setDaemon(true);
            worker.start();
        }
        void offer(Object event) {
            if (accepting && !queue.offer(event)) dropped.incrementAndGet();
        }
        void drain() {
            long written = 0;
            String reason = "STOPPED";
            try (BufferedWriter output = writer) {
                String header = "HEADER 2 " + observer.startEpochMillis + " " + limit + " " + duration + "\n"
                    + "FIELDS elapsed_ns exchange connection phase failure accepted_bytes channel_bytes encoder_complete reused connection_age_ns declared_length encoding chunked local_port operation\n";
                output.write(header); written += header.length(); output.flush();
                while (accepting || !queue.isEmpty()) {
                    if (duration > 0 && observer.elapsedNanos() >= duration) { reason = "TIME_LIMIT"; break; }
                    Object event = queue.poll(100, TimeUnit.MILLISECONDS);
                    if (event != null) {
                        String line = event instanceof TransportObserver.Event
                            ? "HTTP " + ((TransportObserver.Event) event).safeLine() : ((Operation) event).line();
                        if (written + line.length() + 256 >= limit) { reason = "SIZE_LIMIT"; break; }
                        output.write(line); output.newLine(); written += line.length() + 1;
                    }
                    if (queue.isEmpty()) output.flush();
                }
                accepting = false;
                if (reason.equals("SIZE_LIMIT")) {
                    System.err.println("KUPUA_ES_DIAG: metadata capture stopped at size limit");
                }
                output.write("END " + reason + " dropped_queue=" + dropped.get()
                    + " dropped_ring=" + observer.droppedEvents() + " dropped_associations=" + observer.droppedPending()
                    + " remaining_queue=" + queue.size() + "\n");
            } catch (IOException | InterruptedException error) {
                System.err.println("KUPUA_ES_DIAG: metadata capture stopped; capture may be incomplete");
                if (error instanceof InterruptedException) Thread.currentThread().interrupt();
            } finally {
                accepting = false;
                queue.clear();
            }
        }
        @Override public void close() {
            accepting = false;
            try { worker.join(2000); }
            catch (InterruptedException error) { Thread.currentThread().interrupt(); }
            observer.close();
        }
    }

    public static void stop() {
        Capture active = capture;
        if (active != null) active.close();
    }
}
