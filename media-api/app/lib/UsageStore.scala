package lib

import java.util.concurrent.atomic.AtomicReference

import org.apache.pekko.actor.{Cancellable, Scheduler}
import com.gu.mediaservice.lib.BaseStore
import com.gu.mediaservice.lib.logging.{GridLogging, LogMarker, MarkerMap}
import com.gu.mediaservice.model.{Agencies, Agency, UsageRights}
import com.gu.mediaservice.model.usage.{DigitalUsage, PrintUsage, PublishedUsageStatus, RemovedUsageStatus, UnknownUsageStatus, Usage, UsageStatus, UsageType}
import org.joda.time.{DateTime, Duration}
import play.api.libs.functional.syntax._
import play.api.libs.json._

import scala.concurrent.{ExecutionContext, Future}
import scala.concurrent.duration._
import scala.util.control.NonFatal
import scala.util.{Failure, Success}

case class SupplierUsageQuota(agency: Agency, count: Int)
object SupplierUsageQuota {
  implicit val writes: Writes[SupplierUsageQuota] = (
    (__ \ "agency").write[String].contramap((a: Agency) => a.supplier) ~
    (__ \ "count").write[Int]
  )(unlift(SupplierUsageQuota.unapply))

  implicit val customReads: Reads[SupplierUsageQuota] = (
    (__ \ "agency").read[String].map(Agency(_)) ~
    (__ \ "count").read[Int]
  )(SupplierUsageQuota.apply _)
}

case class SupplierQuotaCount(agency: Agency, count: Long)
object SupplierQuotaCount {
  implicit val customReads: Reads[SupplierQuotaCount] = (
    (__ \ "Supplier").read[String].map(Agency(_)) ~
    (__ \ "Usage").read[Long]
  )(SupplierQuotaCount.apply _)

  implicit val writes: Writes[SupplierQuotaCount] = (
    (__ \ "agency").write[String].contramap((a: Agency) => a.supplier) ~
    (__ \ "count").write[Long]
  )(unlift(SupplierQuotaCount.unapply))
}

case class SupplierUsageStatus(
  exceeded: Boolean,
  fractionOfQuota: Float,
  usage: SupplierQuotaCount,
  quota: Option[SupplierUsageQuota]
)
object SupplierUsageStatus {
  implicit val writes: Writes[SupplierUsageStatus] = Json.writes[SupplierUsageStatus]
}

case class StoreAccess(store: Map[String, SupplierUsageStatus], lastUpdated: DateTime)
object StoreAccess {
  import play.api.libs.json.JodaWrites._

  implicit val writes: Writes[StoreAccess] = Json.writes[StoreAccess]
}

object UsageStore extends GridLogging {
  val countQualifyingStatuses: Set[UsageStatus] = Set(PublishedUsageStatus, UnknownUsageStatus, RemovedUsageStatus)
  val countQualifyingPlatforms: Set[UsageType] = Set(PrintUsage, DigitalUsage)
  val countPeriodInDays: Int = 30
  val refreshInterval: FiniteDuration = 10.minutes

  def getSupplierUsageStatus(quotaCount: SupplierQuotaCount, quota: Option[SupplierUsageQuota]): SupplierUsageStatus = {
    val exceeded = quota.exists(q => quotaCount.count >= q.count) // Hitting quota counts as exceeding quota
    val fractionOfQuota = quota.map(q => quotaCount.count.toFloat / q.count).getOrElse(0F)
    SupplierUsageStatus(exceeded, fractionOfQuota, quotaCount, quota)
  }
}

class UsageStore(
  getSupplierQuotaCount: (String, Int) => Future[SupplierQuotaCount],
  quotaStore: QuotaStore
)(implicit val ec: ExecutionContext) extends GridLogging {

  private val store: AtomicReference[Map[String, SupplierUsageStatus]] = new AtomicReference(Map.empty)
  private val lastUpdated: AtomicReference[DateTime] = new AtomicReference(DateTime.now())
  private var cancellable: Option[Cancellable] = None

  def getUsageStatusForUsageRights(usageRights: UsageRights): Future[SupplierUsageStatus] =
    usageRights match {
      case agency: Agency =>
        store.get().get(agency.supplier) match {
          case Some(status) => Future.successful(status)
          case None         => Future.failed(NoUsageQuota())
        }
      case _ =>
        Future.failed(new Exception("Image is not supplied by Agency"))
    }

  def getUsageStatus(): Future[StoreAccess] =
    Future.successful(StoreAccess(store.get(), lastUpdated.get()))

  def overQuotaAgencies: List[Agency] = store.get().collect {
    case (_, status) if status.exceeded => status.usage.agency
  }.toList

  def update(): Unit = {
    implicit val logMarker: LogMarker = MarkerMap()
    logger.info("Updating UsageStore from ElasticSearch")
    fetchQuotaCount.onComplete {
      case Success(newStore) =>
        store.set(newStore)
        lastUpdated.set(DateTime.now())
        logger.info(s"UsageStore updated: ${newStore.size} suppliers")
      case Failure(e) =>
        val staleForMinutes = new Duration(lastUpdated.get(), DateTime.now()).getStandardMinutes
        logger.error(s"Failed to update UsageStore. Data is now $staleForMinutes minute(s) stale; last updated at: ${lastUpdated.get()}", e)
    }
  }

  def scheduleUpdates(scheduler: Scheduler): Unit = {
    cancellable = Some(scheduler.scheduleAtFixedRate(0.seconds, UsageStore.refreshInterval)(() =>
      try update()
      catch { case NonFatal(e) => logger.error("UsageStore update failed", e) }
    ))
  }

  def stopUpdates(): Unit = cancellable.foreach(_.cancel())

  private def fetchQuotaCount(implicit logMarker: LogMarker): Future[Map[String, SupplierUsageStatus]] = {
    val supplierQuota = quotaStore.getQuota
    Future.sequence(
      Agencies.all.map { case (id, agency) =>
        getSupplierQuotaCount(id, UsageStore.countPeriodInDays).map { quotaCount =>
          val quota = supplierQuota.get(id)
          agency.supplier -> UsageStore.getSupplierUsageStatus(quotaCount, quota)
        }
      }.toList
    ).map(_.toMap)
  }
}

class QuotaStore(
  quotaFile: String,
  bucket: String,
  config: MediaApiConfig
)(implicit ec: ExecutionContext) extends BaseStore[String, SupplierUsageQuota](bucket, config)(ec) {

  def getQuota: Map[String, SupplierUsageQuota] = store.get()

  def update(): Unit = {
    store.set(fetchQuota)
  }

  private def fetchQuota: Map[String, SupplierUsageQuota] = {
    val quotaFileString = getS3Object(quotaFile).get

    val summary = Json
      .parse(quotaFileString)
      .as[List[SupplierUsageQuota]]

      summary.foldLeft(Map[String,SupplierUsageQuota]())((memo, quota) => {
        memo + (quota.agency.supplier -> quota)
      })
  }
}
