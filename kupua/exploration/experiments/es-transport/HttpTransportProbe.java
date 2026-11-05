import com.gu.mediaservice.lib.elasticsearch.diagnostics.TransportObserver;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.zip.GZIPInputStream;
import java.util.zip.GZIPOutputStream;
import org.apache.http.HttpHost;
import org.apache.http.entity.AbstractHttpEntity;
import org.apache.http.entity.ByteArrayEntity;
import org.apache.http.entity.ContentType;
import org.apache.http.entity.InputStreamEntity;
import org.apache.http.entity.StringEntity;
import org.apache.http.message.BasicHeader;
import org.apache.http.util.EntityUtils;
import org.elasticsearch.client.*;

public final class HttpTransportProbe {
    private static final int PARALLEL = 3;
    private static final int ROUNDS = 40;
    private static final int BODY_LIMIT = 1_048_576;
    private static final String RESPONSE = "{\"ok\":true}";

    private enum Mode {
        GZIP_CHUNKED(true, true), PLAIN_FIXED(false, false), PLAIN_CHUNKED(false, true), GZIP_FIXED(true, false);
        final boolean gzip;
        final boolean chunked;
        Mode(boolean gzip, boolean chunked) { this.gzip = gzip; this.chunked = chunked; }
    }

    public static void main(String[] args) throws Exception {
        System.out.println("Java runtime: " + System.getProperty("java.version"));
        for (boolean observed : new boolean[]{false, true}) {
            for (boolean fragmented : new boolean[]{false, true}) {
                for (Mode mode : Mode.values()) {
                    runCase(mode, fragmented, observed);
                }
            }
        }
        System.out.println("PASS: all local cases and incomplete-body controls. This does not exercise SSM or prove infrastructure fault.");
    }

    private static String body(int size, long seed) {
        Random random = new Random(seed);
        StringBuilder text = new StringBuilder("{\"synthetic\":\"");
        for (int i = 0; i < size; i++) text.append((char) ('a' + random.nextInt(26)));
        return text.append("\"}").toString();
    }

    private static AbstractHttpEntity entity(String payload, Mode mode) throws IOException {
        // Only GZIP_CHUNKED matches production; controls vary compression and framing independently.
        if (mode == Mode.GZIP_FIXED) {
            ByteArrayOutputStream bytes = new ByteArrayOutputStream();
            try (GZIPOutputStream gzip = new GZIPOutputStream(bytes)) {
                gzip.write(payload.getBytes(StandardCharsets.UTF_8));
            }
            ByteArrayEntity entity = new ByteArrayEntity(bytes.toByteArray(), ContentType.APPLICATION_JSON);
            entity.setContentEncoding("gzip");
            return entity;
        }
        if (mode == Mode.PLAIN_CHUNKED) {
            InputStreamEntity entity = new InputStreamEntity(
                new ByteArrayInputStream(payload.getBytes(StandardCharsets.UTF_8)), -1, ContentType.APPLICATION_JSON);
            entity.setChunked(true);
            return entity;
        }
        return new StringEntity(payload, ContentType.APPLICATION_JSON);
    }

    private static void runCase(Mode mode, boolean fragmented, boolean observed) throws Exception {
        long start = System.nanoTime();
        try (Receiver receiver = new Receiver(mode, fragmented);
             TransportObserver observer = new TransportObserver(4096, 256)) {
            RestClientBuilder builder = RestClient.builder(new HttpHost("127.0.0.1", receiver.port(), "http"))
                .setCompressionEnabled(mode == Mode.GZIP_CHUNKED)
                .setDefaultHeaders(new BasicHeader[]{new BasicHeader("Accept-Encoding", "gzip")});
            if (observed) builder.setHttpClientConfigCallback(observer::install);
            try (RestClient client = builder.build()) {
                for (int round = 0; round < ROUNDS; round++) {
                    CountDownLatch completed = new CountDownLatch(PARALLEL);
                    Queue<Exception> failures = new ConcurrentLinkedQueue<>();
                    for (int n = 0; n < PARALLEL; n++) {
                        int id = round * PARALLEL + n;
                        String path = "/synthetic/" + id;
                        String payload = body(new int[]{512, 8192, 262144}[n], id);
                        receiver.expected.put(path, payload);
                        Request request = new Request("POST", path);
                        request.setEntity(entity(payload, mode));
                        client.performRequestAsync(request, new ResponseListener() {
                            public void onSuccess(Response response) {
                                try {
                                    require(response.getStatusLine().getStatusCode() == 200, "wrong response status");
                                    require(RESPONSE.equals(EntityUtils.toString(response.getEntity())), "gzip response decoding mismatch");
                                } catch (Exception e) {
                                    failures.add(e);
                                } finally {
                                    completed.countDown();
                                }
                            }
                            public void onFailure(Exception e) {
                                failures.add(e);
                                completed.countDown();
                            }
                        });
                    }
                    require(completed.await(35, TimeUnit.SECONDS), "client batch deadline exceeded");
                    if (!failures.isEmpty()) throw new IOException("client request failed", failures.peek());
                    receiver.check();
                }
            }
            receiver.incompleteControls();
            receiver.check();
            int expected = ROUNDS * PARALLEL;
            require(receiver.complete.get() == expected, "missing complete messages");
            require(receiver.terminalChunks.get() == (mode.chunked ? expected : 0), "missing or unexpected terminating chunks");
            require(receiver.connections.get() < expected, "connection reuse was not exercised");
            require(receiver.peak.get() == PARALLEL, "concurrency was not exercised");
            if (observed) {
                require(observer.completedRequests() == expected, "observer missed encoder completion");
                require(observer.acceptedAtCompletion() == receiver.encodedBytes.get(), "encoder/receiver byte counts differ");
                require(observer.snapshot().stream().anyMatch(e -> e.reused), "observer missed reuse");
                require(observer.snapshot().stream().filter(e -> e.phase == TransportObserver.Phase.ASSIGNED)
                    .map(e -> e.exchange).distinct().count() == expected, "exchange association lost or duplicated");
                require(observer.snapshot().stream().filter(e -> e.phase == TransportObserver.Phase.ASSIGNED)
                    .allMatch(e -> e.chunked == mode.chunked
                        && (e.encoding == TransportObserver.Encoding.GZIP) == mode.gzip
                        && (mode.chunked ? e.declaredLength == -1 : e.declaredLength > 0)),
                    "observer changed or misreported entity metadata");
                Map<Long, Integer> portsByConnection = new HashMap<>();
                for (TransportObserver.Event event : observer.snapshot()) {
                    if (event.connection == 0) {
                        require(event.localPort == -1, "unassigned event invents a socket port");
                    } else {
                        require(receiver.clientPorts.contains(event.localPort), "port does not match receiver's peer socket");
                        Integer previous = portsByConnection.putIfAbsent(event.connection, event.localPort);
                        require(previous == null || previous == event.localPort, "connection port changes across lifecycle");
                    }
                }
                require(new HashSet<>(portsByConnection.values()).equals(receiver.clientPorts), "socket mapping incomplete");
                require(portsByConnection.size() == receiver.connections.get(), "connection aliases share an unexpected port");
                require(observer.pendingCount() == 0 && observer.droppedPending() == 0, "pending association leaked");
            } else {
                require(observer.snapshot().isEmpty(), "disabled observer recorded events");
            }
            System.out.printf(Locale.ROOT,
                "PASS observed=%s mode=%s receiver=%s complete=%d terminalChunks=%d connections=%d peak=%d incompleteControls=%d elapsedMs=%d%n",
                observed, mode, fragmented ? "fragmented-delayed" : "normal",
                receiver.complete.get(), receiver.terminalChunks.get(), receiver.connections.get(),
                receiver.peak.get(), receiver.incomplete.get(), (System.nanoTime() - start) / 1_000_000);
        }
    }

    private static void require(boolean condition, String message) throws IOException {
        if (!condition) throw new IOException(message);
    }

    private static final class Receiver implements AutoCloseable {
        final Map<String, String> expected = new ConcurrentHashMap<>();
        final AtomicInteger complete = new AtomicInteger();
        final AtomicInteger terminalChunks = new AtomicInteger();
        final java.util.concurrent.atomic.AtomicLong encodedBytes = new java.util.concurrent.atomic.AtomicLong();
        final AtomicInteger connections = new AtomicInteger();
        final AtomicInteger active = new AtomicInteger();
        final AtomicInteger peak = new AtomicInteger();
        final AtomicInteger incomplete = new AtomicInteger();
        final Queue<Exception> failures = new ConcurrentLinkedQueue<>();
        final Set<Socket> sockets = ConcurrentHashMap.newKeySet();
        final Set<Integer> clientPorts = ConcurrentHashMap.newKeySet();
        final CountDownLatch controlLatch = new CountDownLatch(2);
        final CyclicBarrier batchHeaders = new CyclicBarrier(PARALLEL);
        final ExecutorService workers = Executors.newFixedThreadPool(PARALLEL + 2);
        final ServerSocket server;
        final Thread acceptor;
        final Mode mode;
        final boolean fragmented;
        final byte[] responseBytes;
        volatile boolean closing;

        Receiver(Mode mode, boolean fragmented) throws IOException {
            this.mode = mode;
            this.fragmented = fragmented;
            ByteArrayOutputStream response = new ByteArrayOutputStream();
            try (GZIPOutputStream gzip = new GZIPOutputStream(response)) {
                gzip.write(RESPONSE.getBytes(StandardCharsets.UTF_8));
            }
            responseBytes = response.toByteArray();
            server = new ServerSocket(0, 16, InetAddress.getByName("127.0.0.1"));
            acceptor = new Thread(() -> {
                while (!closing) {
                    try {
                        Socket socket = server.accept();
                        sockets.add(socket);
                        socket.setSoTimeout(5000);
                        workers.submit(() -> receive(socket));
                    } catch (IOException e) {
                        if (!closing) failures.add(e);
                    }
                }
            }, "synthetic-http-receiver");
            acceptor.start();
        }

        int port() { return server.getLocalPort(); }

        void receive(Socket socket) {
            String path = null;
            boolean countedConnection = false;
            boolean inFlight = false;
            try (Socket owned = socket) {
                InputStream input = socket.getInputStream();
                OutputStream output = socket.getOutputStream();
                while (!closing) {
                    path = null;
                    String line = readLine(input);
                    if (line == null) return;
                    String[] request = line.split(" ");
                    require(request.length == 3 && request[0].equals("POST"), "unexpected request line");
                    path = request[1];
                    Map<String, String> headers = new HashMap<>();
                    while (true) {
                        line = readLine(input);
                        if (line == null) throw new EOFException("headers incomplete");
                        if (line.isEmpty()) break;
                        int colon = line.indexOf(':');
                        require(colon > 0, "malformed header");
                        headers.put(line.substring(0, colon).toLowerCase(Locale.ROOT), line.substring(colon + 1).trim());
                    }
                    boolean control = path.startsWith("/control-");
                    if (!control) {
                        if (!countedConnection) {
                            connections.incrementAndGet(); countedConnection = true;
                            clientPorts.add(socket.getPort());
                        }
                        inFlight = true;
                        peak.accumulateAndGet(active.incrementAndGet(), Math::max);
                        batchHeaders.await(5, TimeUnit.SECONDS);
                        require("gzip".equals(headers.get("accept-encoding")), "response compression not requested");
                    }
                    boolean chunked = "chunked".equalsIgnoreCase(headers.get("transfer-encoding"));
                    boolean gzip = "gzip".equalsIgnoreCase(headers.get("content-encoding"));
                    if (!control) require(chunked == mode.chunked && gzip == mode.gzip, "unexpected request framing");
                    ByteArrayOutputStream bytes = new ByteArrayOutputStream();
                    if (chunked) {
                        require(!headers.containsKey("content-length"), "ambiguous framing");
                        while (true) {
                            String chunk = readLine(input);
                            if (chunk == null) throw new EOFException("missing terminal chunk");
                            int length = Integer.parseInt(chunk.split(";", 2)[0], 16);
                            if (length == 0) {
                                require("".equals(readLine(input)), "missing final chunk terminator");
                                terminalChunks.incrementAndGet();
                                break;
                            }
                            readBytes(input, bytes, length);
                            require("".equals(readLine(input)), "missing chunk boundary");
                        }
                    } else {
                        require(headers.containsKey("content-length"), "missing content length");
                        readBytes(input, bytes, Integer.parseInt(headers.get("content-length")));
                    }
                    require(!control, "incomplete-message control was incorrectly accepted");
                    byte[] decoded = bytes.toByteArray();
                    encodedBytes.addAndGet(decoded.length);
                    if (gzip) {
                        try (GZIPInputStream stream = new GZIPInputStream(new ByteArrayInputStream(decoded))) {
                            decoded = stream.readAllBytes();
                        }
                    }
                    require(new String(decoded, StandardCharsets.UTF_8).equals(expected.remove(path)), "received payload differs");
                    complete.incrementAndGet();
                    String response = "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Encoding: gzip\r\n"
                        + "Content-Length: " + responseBytes.length + "\r\nConnection: keep-alive\r\n\r\n";
                    output.write(response.getBytes(StandardCharsets.US_ASCII));
                    output.write(responseBytes);
                    output.flush();
                    active.decrementAndGet();
                    inFlight = false;
                }
            } catch (EOFException e) {
                if (path != null && path.startsWith("/control-")) {
                    incomplete.incrementAndGet();
                    controlLatch.countDown();
                } else if (!closing) failures.add(e);
            } catch (Exception e) {
                if (!closing) failures.add(e);
            } finally {
                if (inFlight) active.decrementAndGet();
                sockets.remove(socket);
            }
        }

        private String readLine(InputStream input) throws IOException {
            ByteArrayOutputStream line = new ByteArrayOutputStream();
            while (true) {
                int value = input.read();
                if (value < 0) {
                    if (line.size() == 0) return null;
                    throw new EOFException("partial line");
                }
                if (value == '\n') {
                    byte[] raw = line.toByteArray();
                    require(raw.length > 0 && raw[raw.length - 1] == '\r', "line missing CRLF");
                    return new String(raw, 0, raw.length - 1, StandardCharsets.US_ASCII);
                }
                require(line.size() < 8192, "oversized line");
                line.write(value);
            }
        }

        private void readBytes(InputStream input, ByteArrayOutputStream bytes, int length) throws Exception {
            require(length >= 0 && length <= BODY_LIMIT - bytes.size(), "body limit exceeded");
            byte[] buffer = new byte[fragmented ? 257 : 8192];
            int reads = 0;
            while (length > 0) {
                int n = input.read(buffer, 0, Math.min(buffer.length, length));
                if (n < 0) throw new EOFException("body incomplete");
                bytes.write(buffer, 0, n);
                length -= n;
                if (fragmented && ++reads % 16 == 0) Thread.sleep(1);
            }
        }

        void incompleteControls() throws Exception {
            String[] requests = {
                "POST /control-fixed HTTP/1.1\r\nHost: localhost\r\nContent-Length: 10\r\n\r\nabc",
                "POST /control-chunked HTTP/1.1\r\nHost: localhost\r\nTransfer-Encoding: chunked\r\n\r\n3\r\nabc\r\n"
            };
            for (String request : requests) {
                try (Socket socket = new Socket("127.0.0.1", port())) {
                    socket.getOutputStream().write(request.getBytes(StandardCharsets.US_ASCII));
                    socket.getOutputStream().flush();
                }
            }
            require(controlLatch.await(5, TimeUnit.SECONDS) && incomplete.get() == 2, "incomplete-message detection failed");
        }

        void check() throws IOException {
            if (!failures.isEmpty()) throw new IOException("receiver rejected a request", failures.peek());
        }

        public void close() throws Exception {
            closing = true;
            server.close();
            for (Socket socket : sockets) socket.close();
            workers.shutdownNow();
            acceptor.join(2000);
            require(workers.awaitTermination(5, TimeUnit.SECONDS), "receiver workers did not terminate");
        }
    }
}
