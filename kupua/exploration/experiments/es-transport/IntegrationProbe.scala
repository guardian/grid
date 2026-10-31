import com.gu.mediaservice.lib.elasticsearch.ElasticSearchExecutions
import com.gu.mediaservice.lib.elasticsearch.diagnostics.LocalTransportDiagnostics
import com.gu.mediaservice.lib.logging.{LogMarker, MarkerMap}
import com.sksamuel.elastic4s._
import com.sksamuel.elastic4s.ElasticDsl._
import com.sksamuel.elastic4s.http.JavaClient
import com.sun.net.httpserver.HttpServer
import java.io.{ByteArrayInputStream, ByteArrayOutputStream}
import java.net.{InetAddress, InetSocketAddress}
import java.nio.charset.StandardCharsets
import java.nio.file.{Files, Paths}
import java.util.concurrent.{ConcurrentLinkedQueue, Executors, Phaser, TimeUnit}
import java.util.concurrent.atomic.{AtomicBoolean, AtomicInteger}
import java.util.zip.{GZIPInputStream, GZIPOutputStream}
import org.apache.http.HttpHost
import org.apache.http.impl.nio.client.HttpAsyncClients
import org.elasticsearch.client.{Request, Response, ResponseListener, RestClient}
import scala.concurrent.{Await, ExecutionContext, Future, Promise}
import scala.concurrent.duration._
import scala.jdk.CollectionConverters._

object IntegrationProbe {
  private val response = """{"took":1,"timed_out":false,"_shards":{"total":1,"successful":1,"skipped":0,"failed":0},"hits":{"total":{"value":0,"relation":"eq"},"max_score":null,"hits":[]}}"""

  def main(args: Array[String]): Unit = {
    val mode = args.head
    val capture = Paths.get(args(1))
    if (mode == "non-loopback" || mode == "existing-file") {
      if (mode == "existing-file") Files.writeString(capture, "SYNTHETIC_EXISTING_FILE")
      val host = if (mode == "non-loopback") "not-loopback.invalid" else "127.0.0.1"
      LocalTransportDiagnostics.configure(HttpAsyncClients.custom(), Array(new HttpHost(host, 1)))
      assert(!LocalTransportDiagnostics.begin("search-after").isActive)
      if (mode == "existing-file") assert(Files.readString(capture) == "SYNTHETIC_EXISTING_FILE")
      else assert(!Files.exists(capture))
      println(s"PASS integration guard=$mode; no network connection opened")
      return
    }

    val worker = Executors.newFixedThreadPool(4)
    val submitter = Executors.newFixedThreadPool(4)
    val callbacks = new Phaser(1)
    val callbackFailures = new ConcurrentLinkedQueue[Throwable]()
    implicit val ec: ExecutionContext = new ExecutionContext {
      override def execute(task: Runnable): Unit = {
        callbacks.register()
        try submitter.execute(() => try task.run() finally callbacks.arriveAndDeregister())
        catch {
          case scala.util.control.NonFatal(error) =>
            callbacks.arriveAndDeregister()
            throw error
        }
      }
      override def reportFailure(error: Throwable): Unit = { callbackFailures.add(error); () }
    }
    implicit val marker: LogMarker = MarkerMap()
    val server = HttpServer.create(new InetSocketAddress(InetAddress.getByName("127.0.0.1"), 0), 16)
    val requests = new AtomicInteger()
    val malformed = new AtomicInteger()
    val failNext = new AtomicBoolean(false)
    server.setExecutor(worker)
    server.createContext("/", exchange => {
      try {
        val raw = exchange.getRequestBody.readAllBytes()
        val gzip = "gzip" == exchange.getRequestHeaders.getFirst("Content-Encoding")
        val decoded = if (gzip) {
          val stream = new GZIPInputStream(new ByteArrayInputStream(raw))
          try stream.readAllBytes() finally stream.close()
        } else raw
        if (!gzip || !new String(decoded, StandardCharsets.UTF_8).startsWith("{")) malformed.incrementAndGet()
        requests.incrementAndGet()
        val failed = failNext.getAndSet(false)
        val text = if (failed) """{"error":{"type":"synthetic","reason":"synthetic"},"status":503}""" else response
        val bytes = new ByteArrayOutputStream()
        val compressed = new GZIPOutputStream(bytes)
        compressed.write(text.getBytes(StandardCharsets.UTF_8))
        compressed.close()
        exchange.getResponseHeaders.add("Content-Type", "application/json")
        exchange.getResponseHeaders.add("Content-Encoding", "gzip")
        exchange.sendResponseHeaders(if (failed) 503 else 200, bytes.size().toLong)
        exchange.getResponseBody.write(bytes.toByteArray)
      } finally exchange.close()
    })
    server.start()
    val host = new HttpHost("127.0.0.1", server.getAddress.getPort, "http")
    val rest = RestClient.builder(host).setCompressionEnabled(true)
      .setHttpClientConfigCallback(builder => LocalTransportDiagnostics.configure(builder, Array(host))).build()
    val service = new ElasticSearchExecutions {
      override val client: ElasticClient = ElasticClient(JavaClient.fromRestClient(rest))
    }
    try {
      val runs = (1 to 20).map { index =>
        Future {
          service.executeAndLog(search("synthetic").query(matchAllQuery()).size(1),
            if (index % 2 == 0) "search-after" else "image-rank")
        }.flatMap(identity)
      }
      assert(Await.result(Future.sequence(runs), 15.seconds).forall(_.isSuccess))
      val direct = new Request("POST", "/synthetic/_search")
      direct.setJsonEntity("{}")
      val directResult = Promise[Unit]()
      rest.performRequestAsync(direct, new ResponseListener {
        override def onSuccess(response: Response): Unit = { directResult.success(()); () }
        override def onFailure(error: Exception): Unit = { directResult.failure(error); () }
      })
      Await.result(directResult.future, 5.seconds)
      failNext.set(true)
      val failed = service.executeAndLog(search("synthetic").size(1), "DO_NOT_RETAIN_SYNTHETIC_PRIVATE_LABEL")
      assert(Await.ready(failed, 5.seconds).value.get.isFailure)
      val throwing = new ElasticSearchExecutions {
        override val client: ElasticClient = ElasticClient(new HttpClient {
          override def send(request: ElasticRequest, callback: Either[Throwable, HttpResponse] => Unit): Unit =
            throw new IllegalStateException("DO_NOT_RETAIN_SYNTHETIC_EXCEPTION")
          override def close(): Unit = ()
        })
      }
      val preserved = try {
        throwing.executeAndLog(search("synthetic").size(1), "image-keys")
        false
      } catch { case _: IllegalStateException => true }
      assert(preserved, "synchronous submission failure changed semantics")
      assert(Await.result(service.executeAndLog(search("synthetic").size(1), "image-count"), 5.seconds).isSuccess)
      assert(requests.get == 23 && malformed.get == 0)
      // Completing a Future can schedule more callbacks; wait for that chain before executor shutdown.
      callbacks.awaitAdvanceInterruptibly(callbacks.arrive(), 5, TimeUnit.SECONDS)
      assert(callbackFailures.isEmpty, "fixture completion callback failed")
      submitter.shutdown()
      assert(submitter.awaitTermination(5, TimeUnit.SECONDS))
    } finally {
      rest.close()
      server.stop(0)
      worker.shutdownNow()
      submitter.shutdownNow()
      assert(worker.awaitTermination(5, TimeUnit.SECONDS))
      LocalTransportDiagnostics.stop()
    }
    if (mode == "disabled") {
      assert(!Files.exists(capture))
      println("PASS real elastic4s/Scala integration disabled: 23 gzip reads, original failure semantics, no capture")
    } else {
      val lines = Files.readAllLines(capture).asScala.toVector
      assert(lines.head.startsWith("HEADER 2 ") && lines.head.endsWith(" 0"), "wrong schema or recording cutoff")
      val fields = lines.find(_.startsWith("FIELDS ")).get.split(" ").tail
      val records = lines.filter(_.startsWith("HTTP ")).map(_.split(" ").tail)
      assert(records.forall(_.length == fields.length), "metadata row does not match schema")
      val portColumn = fields.indexOf("local_port")
      assert(portColumn >= 0)
      records.filter(_(fields.indexOf("phase")) == "ASSIGNED").foreach { row =>
        assert(row(portColumn).toInt > 0 && row(portColumn).toInt <= 65535, "missing local socket port")
      }
      assert(lines.last.startsWith("END STOPPED"))
      assert(lines.forall(!_.contains("DO_NOT_RETAIN")))
      assert(Files.size(capture) < 8 * 1024 * 1024)
      val operations = lines.filter(_.startsWith("OP ")).map(_.split(" "))
      val starts = operations.filter(_(4) == "BEGIN")
      val submitted = lines.filter(_.startsWith("HTTP ")).map(_.split(" ")).filter(_(4) == "SUBMITTED")
      assert(starts.size == 23 && submitted.size == 23)
      val ids = starts.map(_(2)).toSet
      assert(ids.size == 23)
      assert(submitted.count(_.last == "0") == 1, "unowned request inherited a leaked operation")
      ids.foreach { id =>
        val expectedSubmissions = if (starts.find(_(2) == id).get.apply(3) == "IMAGE_KEYS") 0 else 1
        assert(submitted.count(_.last == id) == expectedSubmissions, "operation lost or assigned to another request")
        assert(operations.count(row => row(2) == id && row(4) == "SUBMISSION_END") == 1)
        assert(operations.count(row => row(2) == id && Set("SUCCESS", "FAILED")(row(4))) == 1)
      }
      assert(operations.count(_(4) == "FAILED") == 2)
      assert(starts.count(_(3) == "SEARCH_AFTER") == 10 && starts.count(_(3) == "IMAGE_RANK") == 10)
      println("PASS real elastic4s/Scala integration enabled: 22 operation associations + 1 unowned read + 1 synchronous failure; sanitized outcomes, cleanup and no context leakage")
    }
  }
}
