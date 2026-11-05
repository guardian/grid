import com.gu.mediaservice.lib.elasticsearch.diagnostics.TransportObserver;
import java.io.*;
import java.net.*;
import java.nio.ByteBuffer;
import java.nio.channels.WritableByteChannel;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.BooleanSupplier;
import org.apache.http.HttpHost;
import org.apache.http.entity.ContentType;
import org.apache.http.entity.StringEntity;
import org.apache.http.impl.io.HttpTransportMetricsImpl;
import org.apache.http.impl.nio.codecs.ChunkEncoder;
import org.apache.http.impl.nio.reactor.IOReactorConfig;
import org.apache.http.impl.nio.reactor.SessionOutputBufferImpl;
import org.apache.http.util.EntityUtils;
import org.elasticsearch.client.*;

final class DiagnosticControls {
    public static void main(String[] args) throws Exception {
        for (java.lang.reflect.Field field : TransportObserver.Event.class.getDeclaredFields()) {
            require(field.getType().isPrimitive() || field.getType().isEnum(), "event retains non-allowlisted data");
        }
        encoderIsNotDelivery();
        delayedResponseTimeout();
        queuedCancellationAndBounds();
        cancellationDuringSend();
        cancellationAfterCompletion();
        System.out.println("PASS: five diagnostic controls; synthetic faults are not a reproduction of PP3.");
    }

    private static void require(boolean ok, String message) {
        if (!ok) throw new AssertionError(message);
    }
    private static void await(BooleanSupplier ready, String message) throws Exception {
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(6);
        while (!ready.getAsBoolean()) {
            require(System.nanoTime() < deadline, message);
            Thread.sleep(5);
        }
    }
    private static boolean has(TransportObserver observer, TransportObserver.Phase phase) {
        return observer.snapshot().stream().anyMatch(e -> e.phase == phase);
    }

    private static void encoderIsNotDelivery() throws Exception {
        SessionOutputBufferImpl buffer = new SessionOutputBufferImpl(1024, 1024);
        HttpTransportMetricsImpl metrics = new HttpTransportMetricsImpl();
        WritableByteChannel blocked = new WritableByteChannel() {
            public int write(ByteBuffer source) { return 0; }
            public boolean isOpen() { return true; }
            public void close() { }
        };
        ChunkEncoder encoder = new ChunkEncoder(blocked, buffer, metrics, 1024);
        require(encoder.write(ByteBuffer.wrap(new byte[]{1, 2, 3})) == 3, "encoder did not accept bytes");
        encoder.complete();
        require(encoder.isCompleted() && buffer.hasData() && metrics.getBytesTransferred() == 0,
            "encoder completion was incorrectly treated as channel delivery");
        ByteArrayOutputStream received = new ByteArrayOutputStream();
        buffer.flush(new WritableByteChannel() {
            public int write(ByteBuffer source) {
                int n = source.remaining();
                while (source.hasRemaining()) received.write(source.get());
                return n;
            }
            public boolean isOpen() { return true; }
            public void close() { }
        });
        require(new String(received.toByteArray(), StandardCharsets.ISO_8859_1).endsWith("\r\n0\r\n\r\n"),
            "buffer lacked the terminal chunk");
        System.out.println("PASS encoder-complete != channel-delivery: accepted=3 channel=0 terminal-chunk-buffered=true");
    }

    private static RestClient client(Receiver receiver, TransportObserver observer, int pool, int timeout) {
        return RestClient.builder(new HttpHost("127.0.0.1", receiver.port(), "http"))
            .setCompressionEnabled(true)
            .setRequestConfigCallback(b -> b.setSocketTimeout(timeout))
            .setHttpClientConfigCallback(b -> observer.install(b)
                .setMaxConnPerRoute(pool).setMaxConnTotal(pool)
                .setDefaultIOReactorConfig(IOReactorConfig.custom().setSndBufSize(1024).build()))
            .build();
    }

    private static final class Result implements ResponseListener {
        final CountDownLatch done = new CountDownLatch(1);
        volatile boolean success;
        Cancellable cancellable;
        public void onSuccess(Response response) {
            try {
                success = response.getStatusLine().getStatusCode() == 200
                    && "{}".equals(EntityUtils.toString(response.getEntity()));
            } catch (Exception ignored) { success = false; }
            finally { done.countDown(); }
        }
        public void onFailure(Exception ignored) { done.countDown(); }
        void expect(boolean expected) throws Exception {
            require(done.await(6, TimeUnit.SECONDS) && success == expected, "unexpected synthetic request outcome");
        }
    }
    private static Result send(RestClient client, String path, String body) {
        Request request = new Request("POST", path);
        request.setEntity(new StringEntity(body, ContentType.APPLICATION_JSON));
        Result result = new Result();
        result.cancellable = client.performRequestAsync(request, result);
        return result;
    }

    private static void delayedResponseTimeout() throws Exception {
        try (Receiver receiver = new Receiver(); TransportObserver observer = new TransportObserver(128, 16)) {
            try (RestClient client = client(receiver, observer, 2, 600)) {
                Result held = send(client, "/held-response", "{}");
                require(receiver.bodyReceived.await(5, TimeUnit.SECONDS), "receiver did not finish body");
                send(client, "/ok", "{}").expect(true);
                held.expect(false);
                await(() -> has(observer, TransportObserver.Phase.TIMEOUT), "missing timeout event");
                TransportObserver.Event timeout = observer.snapshot().stream()
                    .filter(e -> e.phase == TransportObserver.Phase.TIMEOUT).findFirst().orElseThrow();
                require(timeout.encoderComplete && timeout.acceptedBytes > 0 && timeout.channelBytes > timeout.acceptedBytes,
                    "response stall misclassified as incomplete send");
                require(observer.snapshot().stream().noneMatch(e -> e.exchange == timeout.exchange
                    && e.phase == TransportObserver.Phase.RESPONSE), "held response unexpectedly arrived");
                send(client, "/ok", "{}").expect(true);
            }
            receiver.check();
        }
        System.out.println("PASS delayed-response: complete-body receiver proof + channel progress + timeout; concurrent/successor reads succeed");
    }

    private static void queuedCancellationAndBounds() throws Exception {
        TransportObserver observer = new TransportObserver(8, 2);
        try (Receiver receiver = new Receiver(); TransportObserver owned = observer) {
            try (RestClient client = client(receiver, observer, 1, 5000)) {
                Result held = send(client, "/held-response", "{}");
                require(receiver.bodyReceived.await(5, TimeUnit.SECONDS), "first request not held");
                Result queued = send(client, "/ok", "{}");
                long id = observer.snapshot().stream().filter(e -> e.phase == TransportObserver.Phase.SUBMITTED)
                    .mapToLong(e -> e.exchange).max().orElseThrow();
                queued.cancellable.cancel();
                queued.expect(false);
                require(observer.snapshot().stream().noneMatch(e -> e.exchange == id
                    && e.phase == TransportObserver.Phase.ASSIGNED), "queued cancellation reached a connection");
                for (int i = 0; i < 12; i++) {
                    Result more = send(client, "/ok", "{}");
                    more.cancellable.cancel();
                    more.expect(false);
                }
                require(observer.pendingCount() <= 2 && observer.droppedPending() > 0,
                    "pending association bound not exercised");
                require(observer.snapshot().size() <= 8 && observer.droppedEvents() > 0,
                    "event bound not exercised");
                for (TransportObserver.Event e : observer.snapshot()) {
                    require(e.safeLine().matches("[0-9A-Z_ truefals-]+"), "unexpected diagnostic output field");
                }
                receiver.releaseResponse.countDown();
                held.expect(true);
                send(client, "/ok", "{}").expect(true);
                require(receiver.requests.get() == 2, "cancelled queued requests reached receiver");
            }
            receiver.check();
        }
        require(observer.snapshot().isEmpty() && observer.pendingCount() == 0, "observer cleanup incomplete");
        System.out.println("PASS queued-cancel: no assignment/send; bounded events and weak pending associations; cleanup verified");
    }

    private static void cancellationDuringSend() throws Exception {
        StringBuilder body = new StringBuilder("{\"synthetic\":\"");
        Random random = new Random(41);
        for (int i = 0; i < 4 * 1024 * 1024; i++) body.append((char) ('a' + random.nextInt(26)));
        body.append("\"}");
        try (Receiver receiver = new Receiver(); TransportObserver observer = new TransportObserver(256, 16)) {
            try (RestClient client = client(receiver, observer, 2, 5000)) {
                Result held = send(client, "/held-body", body.toString());
                require(receiver.headersReceived.await(5, TimeUnit.SECONDS), "held-send headers missing");
                await(() -> observer.snapshot().stream().anyMatch(e -> e.phase == TransportObserver.Phase.OUTPUT
                    && e.acceptedBytes > 0 && !e.encoderComplete), "no partial encoder progress");
                long id = observer.snapshot().stream().filter(e -> e.phase == TransportObserver.Phase.ASSIGNED)
                    .mapToLong(e -> e.exchange).min().orElseThrow();
                send(client, "/ok", "{}").expect(true);
                held.cancellable.cancel();
                held.expect(false);
                await(() -> observer.snapshot().stream().anyMatch(e -> e.exchange == id
                    && e.phase == TransportObserver.Phase.CLOSED), "cancelled connection not closed");
                require(observer.snapshot().stream().noneMatch(e -> e.exchange == id && e.encoderComplete),
                    "held send completed unexpectedly");
                require(receiver.heldBodies.get() == 0, "held receiver consumed the body");
                send(client, "/ok", "{}").expect(true);
            }
            receiver.check();
        }
        System.out.println("PASS during-send-cancel: partial encoder progress, no completion, connection closed; concurrent/successor reads succeed");
    }

    private static void cancellationAfterCompletion() throws Exception {
        try (Receiver receiver = new Receiver(); TransportObserver observer = new TransportObserver(128, 16)) {
            try (RestClient client = client(receiver, observer, 1, 5000)) {
                Result first = send(client, "/ok", "{}");
                first.expect(true);
                await(() -> has(observer, TransportObserver.Phase.RESPONSE_COMPLETE), "missing response completion");
                first.cancellable.cancel();
                send(client, "/ok", "{}").expect(true);
                require(observer.snapshot().stream().filter(e -> e.phase == TransportObserver.Phase.ASSIGNED)
                    .map(e -> e.connection).distinct().count() == 1, "late cancellation prevented healthy reuse");
                require(receiver.requests.get() == 2, "wrong completed request count");
            }
            receiver.check();
        }
        System.out.println("PASS after-completion-cancel: healthy connection reused without disturbing successor");
    }

    private static final class Receiver implements AutoCloseable {
        final ServerSocket server;
        final Set<Socket> sockets = ConcurrentHashMap.newKeySet();
        final Queue<Throwable> failures = new ConcurrentLinkedQueue<>();
        final ExecutorService workers = Executors.newFixedThreadPool(4);
        final CountDownLatch headersReceived = new CountDownLatch(1), bodyReceived = new CountDownLatch(1);
        final CountDownLatch releaseResponse = new CountDownLatch(1), releaseBody = new CountDownLatch(1);
        final AtomicInteger requests = new AtomicInteger(), heldBodies = new AtomicInteger();
        final Thread acceptor;
        volatile boolean closing;
        Receiver() throws IOException {
            server = new ServerSocket();
            server.setReceiveBufferSize(1024);
            server.bind(new InetSocketAddress(InetAddress.getByName("127.0.0.1"), 0));
            acceptor = new Thread(() -> {
                while (!closing) {
                    try {
                        Socket socket = server.accept(); sockets.add(socket); socket.setSoTimeout(7000);
                        workers.submit(() -> receive(socket));
                    } catch (IOException e) { if (!closing) failures.add(e); }
                }
            }, "synthetic-diagnostic-receiver");
            acceptor.start();
        }
        int port() { return server.getLocalPort(); }
        void receive(Socket socket) {
            String path = "";
            try (Socket owned = socket) {
                InputStream input = new BufferedInputStream(socket.getInputStream(), 1024);
                while (!closing) {
                    String start = line(input);
                    if (start == null) return;
                    path = start.split(" ")[1];
                    requests.incrementAndGet();
                    boolean chunked = false;
                    String header;
                    while (!(header = line(input)).isEmpty()) {
                        if (header.equalsIgnoreCase("Transfer-Encoding: chunked")) chunked = true;
                    }
                    require(chunked, "diagnostic control changed production framing");
                    if (path.equals("/held-body")) {
                        headersReceived.countDown();
                        require(releaseBody.await(7, TimeUnit.SECONDS), "held-body control expired");
                        if (closing) return;
                    }
                    int total = 0;
                    while (true) {
                        int size = Integer.parseInt(Objects.requireNonNull(line(input)), 16);
                        require(size >= 0 && size <= 8 * 1024 * 1024 - total, "synthetic body too large");
                        total += size;
                        for (int i = 0; i < size; i++) if (input.read() < 0) throw new EOFException();
                        require("".equals(line(input)), "bad chunk boundary");
                        if (size == 0) break;
                    }
                    if (path.equals("/held-body")) heldBodies.incrementAndGet();
                    if (path.equals("/held-response")) {
                        bodyReceived.countDown();
                        require(releaseResponse.await(7, TimeUnit.SECONDS), "held-response control expired");
                        if (closing) return;
                    }
                    socket.getOutputStream().write(("HTTP/1.1 200 OK\r\nContent-Length: 2\r\n"
                        + "Content-Type: application/json\r\n\r\n{}").getBytes(StandardCharsets.US_ASCII));
                    socket.getOutputStream().flush();
                }
            } catch (Exception | AssertionError e) { if (!closing) failures.add(e); }
            finally { sockets.remove(socket); }
        }
        private String line(InputStream input) throws IOException {
            ByteArrayOutputStream bytes = new ByteArrayOutputStream();
            while (true) {
                int value = input.read();
                if (value < 0) { if (bytes.size() == 0) return null; throw new EOFException(); }
                if (value == '\n') {
                    byte[] raw = bytes.toByteArray();
                    require(raw.length > 0 && raw[raw.length - 1] == '\r', "bad CRLF");
                    return new String(raw, 0, raw.length - 1, StandardCharsets.US_ASCII);
                }
                require(bytes.size() < 8192, "synthetic line too large");
                bytes.write(value);
            }
        }
        void check() { require(failures.isEmpty(), "synthetic receiver failed"); }
        public void close() throws Exception {
            closing = true;
            releaseResponse.countDown(); releaseBody.countDown(); server.close();
            for (Socket socket : sockets) socket.close();
            workers.shutdownNow(); acceptor.join(2000);
            require(!acceptor.isAlive() && workers.awaitTermination(5, TimeUnit.SECONDS), "receiver cleanup failed");
            check();
        }
    }
}
