package lib

import model.UsageGroup
import org.apache.pekko.Done
import org.apache.pekko.stream.{OverflowStrategy, QueueOfferResult}
import org.apache.pekko.stream.scaladsl.{Source, SourceQueueWithComplete}

import scala.concurrent.{ExecutionContext, Future, Promise}
import scala.util.Success

class UsageGroupStream(implicit executionContext: ExecutionContext) {
  private val sourceQueue =
    Source.queue[WithLogMarker[UsageGroup]](128, OverflowStrategy.backpressure, maxConcurrentOffers = 1)
  private val queue = Promise[SourceQueueWithComplete[WithLogMarker[UsageGroup]]]()

  private var latestOffer = Future.successful(Done)
  private var completion: Option[Future[Done]] = None

  def source: Source[WithLogMarker[UsageGroup], SourceQueueWithComplete[WithLogMarker[UsageGroup]]] = sourceQueue

  private[lib] def attachQueue(sourceQueue: SourceQueueWithComplete[WithLogMarker[UsageGroup]]): Unit =
    require(queue.trySuccess(sourceQueue), "Usage group queue has already been materialized")

  def publish(usageGroup: WithLogMarker[UsageGroup]): Future[Done] = synchronized {
    if (completion.isDefined) Future.failed(new IllegalStateException("Usage group queue is closing"))
    else {
      val nextOffer = latestOffer.transformWith { _ =>
        queue.future.flatMap(_.offer(usageGroup)).flatMap {
          case QueueOfferResult.Enqueued => Future.successful(Done)
          case QueueOfferResult.Dropped =>
            Future.failed(new IllegalStateException("Usage group was dropped by the Pekko queue"))
          case QueueOfferResult.QueueClosed =>
            Future.failed(new IllegalStateException("Usage group queue is closed"))
          case QueueOfferResult.Failure(error) => Future.failed(error)
        }
      }
      latestOffer = nextOffer
      nextOffer
    }
  }

  def complete(): Future[Done] = synchronized {
    completion.getOrElse {
      val closeFuture = queue.future.flatMap { sourceQueue =>
        latestOffer.transform { _ =>
          sourceQueue.complete()
          Success(Done)
        }
      }
      completion = Some(closeFuture)
      closeFuture
    }
  }
}
