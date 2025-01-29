package lib

import org.apache.pekko.actor.ActorSystem
import com.gu.mediaservice.lib.metrics.CloudWatchMetrics
import play.api.inject.ApplicationLifecycle

import scala.concurrent.ExecutionContext

class ThrallMetrics(config: ThrallConfig, actorSystem: ActorSystem, applicationLifecycle: ApplicationLifecycle)(implicit ec: ExecutionContext)
  extends CloudWatchMetrics(s"${config.stage}/Thrall", config, actorSystem, applicationLifecycle) {

  val indexedImages = new CountMetric("IndexedImages")

  val deletedImages = new CountMetric("DeletedImages")

  val softReaped = new CountMetric("SoftReaped")
  val hardReaped = new CountMetric("HardReaped")
  val softReapable = new CountMetric("SoftReapable")
  val hardReapable = new CountMetric("HardReapable")

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
