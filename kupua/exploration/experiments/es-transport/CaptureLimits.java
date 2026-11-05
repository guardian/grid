package com.gu.mediaservice.lib.elasticsearch.diagnostics;

import java.nio.file.*;
import java.util.concurrent.TimeUnit;

public final class CaptureLimits {
    public static void main(String[] args) throws Exception {
        Path directory = Paths.get(args[0]);
        Path sizeFile = directory.resolve("size-limit.log");
        try (LocalTransportDiagnostics.Capture capture = new LocalTransportDiagnostics.Capture(sizeFile, 2048, 0)) {
            for (int i = 0; i < 10000 && capture.accepting; i++) {
                capture.offer(new TransportObserver.Event(i, i, 1, TransportObserver.Phase.OUTPUT,
                    TransportObserver.Failure.NONE, 123, 456, false, true, i,
                    -1, TransportObserver.Encoding.GZIP, true, i, -1));
            }
            capture.worker.join(5000);
            require(!capture.worker.isAlive(), "size-limited writer did not stop");
        }
        String size = Files.readString(sizeFile);
        require(Files.size(sizeFile) <= 2048 && size.contains("END SIZE_LIMIT"), "size bound not enforced");
        Path timeFile = directory.resolve("time-limit.log");
        long start = System.nanoTime();
        try (LocalTransportDiagnostics.Capture capture = new LocalTransportDiagnostics.Capture(timeFile, 2048, 1)) {
            capture.worker.join(5000);
            require(!capture.worker.isAlive(), "time-limited writer did not stop");
        }
        require(Files.readString(timeFile).contains("END TIME_LIMIT"), "time bound not enforced");
        require(System.nanoTime() - start < TimeUnit.SECONDS.toNanos(5), "time bound exceeded");
        Path unlimitedFile = directory.resolve("no-time-limit.log");
        try (LocalTransportDiagnostics.Capture capture = new LocalTransportDiagnostics.Capture(unlimitedFile, 2048, 0)) {
            Thread.sleep(1250);
            require(capture.accepting && capture.worker.isAlive(), "zero duration must disable the time cutoff");
            capture.offer(new TransportObserver.Event(1, 1, 1, TransportObserver.Phase.OUTPUT,
                TransportObserver.Failure.NONE, 3, 4, true, false, 1,
                -1, TransportObserver.Encoding.GZIP, true, 1, -1));
        }
        String unlimited = Files.readString(unlimitedFile);
        require(unlimited.lines().findFirst().orElseThrow().endsWith(" 0"), "header must declare no time limit");
        require(unlimited.contains("HTTP ") && unlimited.contains("END STOPPED") && !unlimited.contains("TIME_LIMIT"),
            "unlimited capture did not retain post-idle event and stop cleanly");
        System.out.println("PASS capture limits: file-size cap, finite/disabled duration, post-idle recording and cleanup");
    }
    private static void require(boolean value, String message) {
        if (!value) throw new AssertionError(message);
    }
}
