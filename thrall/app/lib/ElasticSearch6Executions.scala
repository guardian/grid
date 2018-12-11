package lib

import com.sksamuel.elastic4s.http._
import net.logstash.logback.marker.Markers.appendEntries
import play.api.{Logger, MarkerContext}

import scala.collection.JavaConverters._
import scala.concurrent.ExecutionContext.Implicits.global
import scala.concurrent.Future

trait ElasticSearch6Executions {

  def client: ElasticClient

  def executeAndLog[T, U](request: T, message: String)(implicit
                                                       functor: Functor[Future],
                                                       executor: Executor[Future],
                                                       handler: Handler[T, U],
                                                       manifest: Manifest[U]): Future[Response[U]] = {
    val start = System.currentTimeMillis()
    val result = client.execute(request)

    result.foreach { _ =>
      val elapsed = System.currentTimeMillis() - start
      val markers = MarkerContext(durationMarker(elapsed))
      Logger.info(s"$message - query returned successfully in $elapsed ms")(markers)
    }

    result.failed.foreach { e =>
      val elapsed = System.currentTimeMillis() - start
      val markers = MarkerContext(durationMarker(elapsed))
      Logger.error(s"$message - query failed after $elapsed ms: ${e.getMessage} cs: ${e.getCause}")(markers)
    }

    result
  }

  private def durationMarker(elapsed: Long) = {
    appendEntries(Map("duration" -> elapsed).asJava)
  }

}
