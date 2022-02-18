package lib

import akka.actor.ActorSystem
import com.gu.mediaservice.lib.metrics.CloudWatchMetrics

import scala.concurrent.ExecutionContext

class ThrallMetrics(config: ThrallConfig, actorSystem: ActorSystem)(implicit ec: ExecutionContext)
  extends CloudWatchMetrics(s"${config.stage}/Thrall", config, actorSystem) {

  val indexedImages = new CountMetric("IndexedImages")

  val deletedImages = new CountMetric("DeletedImages")

  val failedDeletedImages = new CountMetric("FailedDeletedImages")

  val failedMetadataUpdates = new CountMetric("FailedMetadataUpdates")

  val failedCollectionsUpdates = new CountMetric("FailedCollectionsUpdates")

  val failedExportsUpdates = new CountMetric("FailedExportsUpdates")

  val failedUsagesUpdates = new CountMetric("FailedUsagesUpdates")

  val failedSyndicationRightsUpdates = new CountMetric("FailedSyndicationRightsUpdates")

  val failedQueryUpdates = new CountMetric("FailedQueryUpdates")

  val failedDeletedAllUsages = new CountMetric("FailedDeletedAllUsages")

  val processingLatency = new TimeMetric("ProcessingLatency")

  val snsMessage = new CountMetric("SNSMessage")

}
