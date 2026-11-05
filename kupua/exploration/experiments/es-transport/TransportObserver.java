package com.gu.mediaservice.lib.elasticsearch.diagnostics;

import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.channels.FileChannel;
import java.util.*;
import java.util.concurrent.atomic.AtomicLong;
import org.apache.http.*;
import org.apache.http.impl.nio.client.HttpAsyncClientBuilder;
import org.apache.http.nio.*;
import org.apache.http.nio.protocol.HttpAsyncRequestExecutor;

/** Temporary observer: no payload access, connection policy changes or outgoing headers. */
public final class TransportObserver extends HttpAsyncRequestExecutor implements AutoCloseable {
    public enum Phase { SUBMITTED, CONNECTED, ASSIGNED, OUTPUT, RESPONSE, RESPONSE_COMPLETE, TIMEOUT, CLOSED, EXCEPTION, EOF }
    public enum Failure { NONE, IO, PROTOCOL, OTHER }
    public enum Encoding { NONE, GZIP, OTHER }

    public static final class Event {
        public final long elapsedNanos, exchange, connection, acceptedBytes, channelBytes, connectionAgeNanos;
        public final Phase phase;
        public final Failure failure;
        public final boolean encoderComplete, reused, chunked;
        public final long declaredLength, operation;
        public final Encoding encoding;
        public final int localPort;
        Event(long elapsed, long exchange, long connection, Phase phase, Failure failure,
              long accepted, long channel, boolean complete, boolean reused, long age,
              long declaredLength, Encoding encoding, boolean chunked, long operation, int localPort) {
            this.elapsedNanos = elapsed; this.exchange = exchange; this.connection = connection;
            this.phase = phase; this.failure = failure; this.acceptedBytes = accepted;
            this.channelBytes = channel; this.encoderComplete = complete; this.reused = reused;
            this.connectionAgeNanos = age; this.declaredLength = declaredLength;
            this.encoding = encoding; this.chunked = chunked; this.operation = operation;
            this.localPort = localPort;
        }
        public String safeLine() {
            return elapsedNanos + " " + exchange + " " + connection + " " + phase + " " + failure
                + " " + acceptedBytes + " " + channelBytes + " " + encoderComplete + " " + reused
                + " " + connectionAgeNanos + " " + declaredLength + " " + encoding + " " + chunked
                + " " + localPort + " " + operation;
        }
    }

    private static final class Exchange {
        final long id, declaredLength, operation;
        final Encoding encoding;
        final boolean chunked;
        long accepted;
        boolean complete;
        Exchange(long id, HttpRequest request, long operation) {
            this.id = id; this.operation = operation;
            HttpEntity entity = request instanceof HttpEntityEnclosingRequest
                ? ((HttpEntityEnclosingRequest) request).getEntity() : null;
            declaredLength = entity == null ? 0 : entity.getContentLength();
            chunked = entity != null && entity.isChunked();
            Header coding = entity == null ? null : entity.getContentEncoding();
            encoding = coding == null ? Encoding.NONE
                : "gzip".equalsIgnoreCase(coding.getValue()) ? Encoding.GZIP : Encoding.OTHER;
        }
    }
    private static final class Connection {
        final long id, born;
        int localPort = -1;
        long baseline, uses;
        Exchange exchange;
        Connection(long id, long born) { this.id = id; this.born = born; }
    }

    private final int eventLimit, pendingLimit;
    private final java.util.function.LongSupplier operation;
    private final java.util.function.Consumer<Event> sink;
    private final long start = System.nanoTime();
    public final long startEpochMillis = System.currentTimeMillis();
    private final Deque<Event> events = new ArrayDeque<>();
    private final Map<HttpRequest, Exchange> pending = new WeakHashMap<>();
    private final String contextKey = TransportObserver.class.getName() + "." + UUID.randomUUID();
    private final AtomicLong nextExchange = new AtomicLong(), nextConnection = new AtomicLong();
    private long droppedEvents, droppedPending, completedRequests, acceptedAtCompletion;
    private boolean closed;

    public TransportObserver(int eventLimit, int pendingLimit) {
        this(eventLimit, pendingLimit, () -> 0L, event -> { });
    }

    public TransportObserver(int eventLimit, int pendingLimit, java.util.function.LongSupplier operation,
                             java.util.function.Consumer<Event> sink) {
        if (eventLimit < 1 || pendingLimit < 1) throw new IllegalArgumentException("positive bounds required");
        this.eventLimit = eventLimit; this.pendingLimit = pendingLimit;
        this.operation = operation; this.sink = sink;
    }

    public HttpAsyncClientBuilder install(HttpAsyncClientBuilder builder) {
        return builder.addInterceptorLast((HttpRequestInterceptor) (request, context) -> {
            Exchange exchange = new Exchange(nextExchange.incrementAndGet(), request, operation.getAsLong());
            synchronized (this) {
                if (closed) return;
                // An interceptor runs before the lease; cancelled queued requests may never be assigned.
                if (pending.size() == pendingLimit) {
                    droppedPending += pending.size();
                    pending.clear();
                }
                pending.put(request, exchange);
                append(new Event(System.nanoTime() - start, exchange.id, 0, Phase.SUBMITTED,
                    Failure.NONE, 0, -1, false, false, -1,
                    exchange.declaredLength, exchange.encoding, exchange.chunked, exchange.operation, -1));
            }
        }).setEventHandler(this);
    }

    private Connection connection(NHttpClientConnection conn) {
        Connection state = (Connection) conn.getContext().getAttribute(contextKey);
        if (state == null) {
            state = new Connection(nextConnection.incrementAndGet(), System.nanoTime());
            conn.getContext().setAttribute(contextKey, state);
        }
        if (state.localPort < 0 && conn instanceof HttpInetConnection) {
            int port = ((HttpInetConnection) conn).getLocalPort();
            if (port > 0 && port <= 65535) state.localPort = port;
        }
        return state;
    }

    private synchronized void append(Event event) {
        if (closed) return;
        if (events.size() == eventLimit) { events.removeFirst(); droppedEvents++; }
        events.addLast(event);
        sink.accept(event);
    }

    private void sample(NHttpClientConnection conn, Phase phase, Failure failure) {
        Connection state = connection(conn);
        Exchange exchange = state.exchange;
        append(new Event(System.nanoTime() - start, exchange == null ? 0 : exchange.id, state.id,
            phase, failure, exchange == null ? 0 : exchange.accepted,
            exchange == null ? -1 : conn.getMetrics().getSentBytesCount() - state.baseline,
            exchange != null && exchange.complete, state.uses > 1, System.nanoTime() - state.born,
            exchange == null ? -1 : exchange.declaredLength,
            exchange == null ? Encoding.NONE : exchange.encoding, exchange != null && exchange.chunked,
            exchange == null ? 0 : exchange.operation, state.localPort));
    }

    @Override public void connected(NHttpClientConnection conn, Object attachment) throws IOException, HttpException {
        connection(conn);
        sample(conn, Phase.CONNECTED, Failure.NONE);
        super.connected(conn, attachment);
    }

    @Override public void requestReady(NHttpClientConnection conn) throws IOException, HttpException {
        long baseline = conn.getMetrics().getSentBytesCount();
        super.requestReady(conn);
        HttpRequest request = conn.getHttpRequest();
        Exchange exchange;
        synchronized (this) { exchange = pending.remove(request); }
        if (request != null) {
            Connection state = connection(conn);
            state.exchange = exchange;
            state.baseline = baseline;
            if (exchange != null) {
                state.uses++;
                sample(conn, Phase.ASSIGNED, Failure.NONE);
            }
        }
    }

    private static class CountingEncoder implements ContentEncoder {
        final ContentEncoder delegate;
        final Exchange exchange;
        CountingEncoder(ContentEncoder delegate, Exchange exchange) { this.delegate = delegate; this.exchange = exchange; }
        public int write(ByteBuffer source) throws IOException {
            int written = delegate.write(source);
            exchange.accepted += written;
            return written;
        }
        public void complete() throws IOException { delegate.complete(); }
        public boolean isCompleted() { return delegate.isCompleted(); }
    }

    private static final class CountingFileEncoder extends CountingEncoder implements FileContentEncoder {
        CountingFileEncoder(FileContentEncoder delegate, Exchange exchange) { super(delegate, exchange); }
        public long transfer(FileChannel source, long position, long count) throws IOException {
            long written = ((FileContentEncoder) delegate).transfer(source, position, count);
            exchange.accepted += written;
            return written;
        }
    }

    @Override public void outputReady(NHttpClientConnection conn, ContentEncoder encoder) throws IOException, HttpException {
        Exchange exchange = connection(conn).exchange;
        if (exchange == null) { super.outputReady(conn, encoder); return; }
        ContentEncoder counted = encoder instanceof FileContentEncoder
            ? new CountingFileEncoder((FileContentEncoder) encoder, exchange) : new CountingEncoder(encoder, exchange);
        try {
            super.outputReady(conn, counted);
        } finally {
            if (!exchange.complete && encoder.isCompleted()) {
                exchange.complete = true;
                synchronized (this) { completedRequests++; acceptedAtCompletion += exchange.accepted; }
            }
            sample(conn, Phase.OUTPUT, Failure.NONE);
        }
    }

    @Override public void responseReceived(NHttpClientConnection conn) throws IOException, HttpException {
        sample(conn, Phase.RESPONSE, Failure.NONE);
        super.responseReceived(conn);
    }
    @Override public void inputReady(NHttpClientConnection conn, ContentDecoder decoder) throws IOException, HttpException {
        super.inputReady(conn, decoder);
        if (decoder.isCompleted()) {
            sample(conn, Phase.RESPONSE_COMPLETE, Failure.NONE);
            connection(conn).exchange = null;
        }
    }
    @Override public void timeout(NHttpClientConnection conn) throws IOException {
        sample(conn, Phase.TIMEOUT, Failure.NONE);
        super.timeout(conn);
    }
    @Override public void exception(NHttpClientConnection conn, Exception error) {
        sample(conn, Phase.EXCEPTION, error instanceof IOException ? Failure.IO
            : error instanceof HttpException ? Failure.PROTOCOL : Failure.OTHER);
        super.exception(conn, error);
    }
    @Override public void endOfInput(NHttpClientConnection conn) throws IOException {
        sample(conn, Phase.EOF, Failure.NONE);
        super.endOfInput(conn);
    }
    @Override public void closed(NHttpClientConnection conn) {
        sample(conn, Phase.CLOSED, Failure.NONE);
        try { super.closed(conn); } finally { conn.getContext().removeAttribute(contextKey); }
    }

    public long elapsedNanos() { return System.nanoTime() - start; }
    public synchronized List<Event> snapshot() { return new ArrayList<>(events); }
    public synchronized long completedRequests() { return completedRequests; }
    public synchronized long acceptedAtCompletion() { return acceptedAtCompletion; }
    public synchronized long droppedEvents() { return droppedEvents; }
    public synchronized long droppedPending() { return droppedPending; }
    public synchronized int pendingCount() { return pending.size(); }
    @Override public synchronized void close() { closed = true; pending.clear(); events.clear(); }
}
