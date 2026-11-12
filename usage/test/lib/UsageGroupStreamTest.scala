package lib

import com.gu.mediaservice.lib.logging.MarkerMap
import model.UsageGroup
import org.apache.pekko.actor.ActorSystem
import org.apache.pekko.stream.SystemMaterializer
import org.apache.pekko.stream.scaladsl.{Keep, Sink}
import org.joda.time.DateTime
import org.scalatest.funsuite.AnyFunSuite
import org.scalatest.matchers.should.Matchers

import scala.concurrent.duration._
import scala.concurrent.{Await, Future}

class UsageGroupStreamTest extends AnyFunSuite with Matchers {

  test("serializes concurrent offers beyond the queue buffer and drains them on completion") {
    val actorSystem = ActorSystem("usage-group-stream-test")
    implicit val materializer = SystemMaterializer(actorSystem).materializer
    implicit val executionContext = actorSystem.dispatcher
    val stream = new UsageGroupStream
    val (queue, emitted) = stream.source.toMat(Sink.seq)(Keep.both).run()
    stream.attachQueue(queue)
    val groups = (1 to 256).map { id =>
      WithLogMarker(
        MarkerMap("test" -> "usage-group-stream"),
        UsageGroup(Set.empty, s"group-$id", DateTime.now())
      )
    }

    try {
      Await.result(Future.sequence(groups.map(stream.publish)), 10.seconds).size shouldBe groups.size
      Await.result(stream.complete(), 5.seconds)
      Await.result(emitted, 5.seconds).toSet shouldBe groups.toSet

      intercept[IllegalStateException] {
        Await.result(stream.publish(groups.head), 5.seconds)
      }
    } finally {
      Await.result(actorSystem.terminate(), 5.seconds)
    }
  }
}
