package lib

import model.UsageGroup
import org.apache.pekko.Done
import org.apache.pekko.NotUsed
import org.apache.pekko.stream.{Materializer, OverflowStrategy, QueueOfferResult}
import org.apache.pekko.stream.scaladsl.Source

import scala.concurrent.{ExecutionContext, Future}

class UsageGroupStream(implicit materializer: Materializer, executionContext: ExecutionContext) {
  private val (queue, usageGroups) =
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

  def source: Source[WithLogMarker[UsageGroup], NotUsed] = usageGroups

  def complete(): Unit = queue.complete()
}
