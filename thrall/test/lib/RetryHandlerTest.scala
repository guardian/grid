package lib

import akka.actor.ActorSystem
import play.api.MarkerContext
import akka.actor.testkit.typed.scaladsl.ScalaTestWithActorTestKit
import org.scalatest.wordspec.AnyWordSpecLike
import java.util.concurrent.TimeUnit.{SECONDS,MILLISECONDS}
import scala.collection.JavaConverters._
import net.logstash.logback.marker.Markers.appendEntries
import org.scalatest.matchers.should.Matchers
import play.api.libs.concurrent.ActorSystemProvider

import scala.concurrent.duration.FiniteDuration
import scala.concurrent.{ExecutionContext, Future}

class RetryHandlerTest extends ScalaTestWithActorTestKit with AnyWordSpecLike with Matchers   {
  private val order = (0 to 10).toList
  private var current = 0
  implicit val executionContext = ExecutionContext.Implicits.global
  implicit val markerContext = MarkerContext(appendEntries(Map("a" -> "a").asJava))

  var tries = 0
  val twoSeconds = FiniteDuration(2,SECONDS)
  val hundredMillis = FiniteDuration(100,MILLISECONDS)
  implicit val system: ActorSystem

  "rety handler" should {
    "only run as many times as retries" in {
      def f = () => {
        tries = tries + 1
        Future.failed(new RuntimeException())
      }

      val retries = 4
      RetryHandler.handleWithRetryAndTimeout(
        f,
        retries,
        twoSeconds,
        hundredMillis
      )

    }
  }

  /**
    * def handleWithRetryAndTimeout[T](f: () => Future[T],
    * retries: Int,
    * timeout: FiniteDuration,
    * delay: FiniteDuration
    * )(implicit actorSystem: ActorSystem,
    * executionContext: ExecutionContext,
    * mc: MarkerContext
    * ): () => Future[T] = {
    */


}
