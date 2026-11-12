package lib

import model.UsageGroup
import org.apache.pekko.Done
import org.apache.pekko.stream.{Materializer, OverflowStrategy, QueueOfferResult}
import org.apache.pekko.stream.scaladsl.Source

import scala.concurrent.{ExecutionContext, Future}

class UsageGroupStream(implicit materializer: Materializer, executionContext: ExecutionContext) {
  private val (queue, source) =
    Source.queue[WithLogMarker[UsageGroup]](128, OverflowStrategy.backpressure).preMaterialize()

  def publish(usageGroup: WithLogMarker[UsageGroup]): Future[Done] =
    queue.offer(usageGroup).flatMap {
      case QueueOfferResult.Enqueued => Future.successful(Done)
      case QueueOfferResult.Dropped =>
        Future.failed(new IllegalStateException("Usage group was dropped by the Pekko queue"))
      case QueueOfferResult.QueueClosed =>
        Future.failed(new IllegalStateException("Usage group queue is closed"))
      case QueueOfferResult.Failure(error) => Future.failed(error)
    }

  def runForeach(onUsageGroup: WithLogMarker[UsageGroup] => Unit): Future[Done] =
    source.runForeach(onUsageGroup)

  def complete(): Unit = queue.complete()
}
