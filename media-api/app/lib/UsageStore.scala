package lib

import java.io.InputStream
import java.util.Properties

import com.gu.mediaservice.lib.BaseStore
import com.gu.mediaservice.lib.logging.GridLogger
import com.gu.mediaservice.model.{Agencies, Agency, UsageRights}
import javax.mail.Session
import javax.mail.internet.{MimeBodyPart, MimeMultipart}
import org.apache.commons.mail.util.MimeMessageUtils
import org.joda.time.DateTime
import play.api.Logger
import play.api.libs.functional.syntax._
import play.api.libs.json._

import scala.concurrent.{ExecutionContext, Future}
import scala.io.Source

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

case class SupplierUsageSummary(agency: Agency, count: Int)
object SupplierUsageSummary {
  implicit val customReads: Reads[SupplierUsageSummary] = (
    (__ \ "Supplier").read[String].map(Agency(_)) ~
    (__ \ "Usage").read[Int]
  )(SupplierUsageSummary.apply _)

  implicit val writes: Writes[SupplierUsageSummary] = (
    (__ \ "agency").write[String].contramap((a: Agency) => a.supplier) ~
    (__ \ "count").write[Int]
  )(unlift(SupplierUsageSummary.unapply))
}

case class UsageStatus(
  exceeded: Boolean,
  fractionOfQuota: Float,
  usage: SupplierUsageSummary,
  quota: Option[SupplierUsageQuota]
)
object UsageStatus {
  implicit val writes: Writes[UsageStatus] = Json.writes[UsageStatus]
}

case class StoreAccess(store: Map[String, UsageStatus], lastUpdated: DateTime)
object StoreAccess {
  import play.api.libs.json.JodaWrites._

  implicit val writes: Writes[StoreAccess] = Json.writes[StoreAccess]
}

object UsageStore {
  def extractEmail(stream: InputStream): List[String] = {
    val s = Session.getDefaultInstance(new Properties())
    val message = MimeMessageUtils.createMimeMessage(s, stream)

    message.getContent match {
      case content: MimeMultipart =>
        val parts = for(n <- 0 until content.getCount) yield content.getBodyPart(n)

        val part = parts
          .collectFirst { case part: MimeBodyPart if part.getEncoding == "base64" => part }
          .map(_.getContent)

        part match {
          case Some(c: InputStream) =>
            Source.fromInputStream(c).getLines().toList

          case _ =>
            Logger.error("Usage email is missing base64 encoded attachment")
            List.empty
        }

      case other =>
        Logger.error(s"Unexpected message content type ${other.getClass}")
        List.empty
    }
  }

  def csvParser(list: List[String]): List[SupplierUsageSummary] = {
    def stripQuotes(s: String): String = s.stripSuffix("\"").stripPrefix("\"")

    val lines = list
      .map(_.split(","))
      .map(_.map(stripQuotes))
      .map(_.toList)

    if(lines.exists(_.length != 2)) {
      Logger.error("CSV header error. Expected 2 columns")
      throw new IllegalArgumentException("CSV header error. Expected 2 columns")
    }

    lines.headOption match {
      case Some("Cpro Name" :: "Id" :: Nil) =>
        lines.tail.map {
          case supplier :: count :: Nil =>
            SupplierUsageSummary(Agency(supplier), count.toInt)

          case _ =>
            Logger.error("CSV body error. Expected 2 columns")
            throw new IllegalArgumentException("CSV body error. Expected 2 columns")
        }

      case other =>
        Logger.error(s"Unexpected CSV headers [${other.mkString(",")}]. Expected [CproName, Id]")
        throw new IllegalArgumentException(s"Unexpected CSV headers [${other.mkString(",")}]. Expected [CproName, Id]")
    }
  }
}

class UsageStore(
  bucket: String,
  config: MediaApiConfig,
  quotaStore: QuotaStore
)(implicit val ec: ExecutionContext) extends BaseStore[String, UsageStatus](bucket, config) {
  import UsageStore._

  def getUsageStatusForUsageRights(usageRights: UsageRights): Future[UsageStatus] = {
    usageRights match {
      case agency: Agency => Future.successful(store.get().getOrElse(agency.supplier, { throw NoUsageQuota() }))
      case _ => Future.failed(new Exception("Image is not supplied by Agency"))
    }
  }

  def getUsageStatus(): Future[StoreAccess] = Future.successful {
    StoreAccess(store.get(), lastUpdated.get())
  }

  def update() {
    lastUpdated.set(DateTime.now())
    fetchUsage.foreach { usage => store.set(usage) }
  }

  private def fetchUsage: Future[Map[String, UsageStatus]] = {
    Logger.info("Updating usage store")

    val lines: List[String] = getLatestS3Stream.map(extractEmail).getOrElse(List.empty)
    Logger.info(s"Last usage file has ${lines.length} lines")

    val summary: List[SupplierUsageSummary] = csvParser(lines)

    def copyAgency(supplier: SupplierUsageSummary, id: String) = Agencies.all.get(id)
      .map(a => supplier.copy(agency = a))
      .getOrElse(supplier)

    val cleanedSummary = summary
      .map {
        case s if s.agency.supplier.contains("Rex Features") => copyAgency(s, "rex")
        case s if s.agency.supplier.contains("Getty Images") => copyAgency(s, "getty")
        case s if s.agency.supplier.contains("Australian Associated Press") => copyAgency(s, "aap")
        case s if s.agency.supplier.contains("Alamy") => copyAgency(s, "alamy")
        case s => s
      }

    quotaStore.getQuota.map { supplierQuota => {
      cleanedSummary
        .groupBy(_.agency.supplier)
        .mapValues(_.head)
        .mapValues((summary: SupplierUsageSummary) => {
          val quota = summary.agency.id.flatMap(id => supplierQuota.get(id))
          val exceeded = quota.exists(q => summary.count > q.count)
          val fractionOfQuota: Float = quota.map(q => summary.count.toFloat / q.count).getOrElse(0F)

          UsageStatus(
            exceeded,
            fractionOfQuota,
            summary,
            quota
          )
        })
    }}
  }
}

class QuotaStore(
  quotaFile: String,
  bucket: String,
  config: MediaApiConfig
)(implicit ec: ExecutionContext) extends BaseStore[String, SupplierUsageQuota](bucket, config)(ec) {

  def getQuota: Future[Map[String, SupplierUsageQuota]] = Future.successful(store.get())

  def update() {
    if (config.quotaUpdateEnabled) {
      store.set(fetchQuota)
    } else {
      GridLogger.info("Quota store updates disabled. Set quota.update.enabled in media-api.properties to enable.")
    }
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
