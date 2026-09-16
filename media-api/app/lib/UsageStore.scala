package lib

import java.io.InputStream
import java.util.Properties

import com.gu.mediaservice.lib.BaseStore
import com.gu.mediaservice.lib.logging.GridLogging
import com.gu.mediaservice.model.{Agencies, Agency, UsageRights}
import com.gu.mediaservice.model.usage.{DigitalUsage, PrintUsage, PublishedUsageStatus, RemovedUsageStatus, UnknownUsageStatus, Usage, UsageStatus, UsageType}
import javax.mail.Session
import javax.mail.internet.{MimeBodyPart, MimeMultipart}
import org.apache.commons.mail.util.MimeMessageUtils
import org.joda.time.DateTime
import play.api.libs.functional.syntax._
import play.api.libs.json._

import scala.collection.compat._
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
            logger.error("Usage email is missing base64 encoded attachment")
            List.empty
        }

      case other =>
        logger.error(s"Unexpected message content type ${other.getClass}")
        List.empty
    }
  }

  def csvParser(list: List[String]): List[SupplierQuotaCount] = {
    def stripQuotes(s: String): String = s
      .stripSuffix("\"")
      .stripPrefix("\"")
      .replaceAll("\\P{ASCII}", "") // strip all non-ascii chars from the CSV

    val lines = list
      .map(_.split(","))
      .map(_.map(stripQuotes))
      .map(_.toList)

    if(lines.exists(_.length != 2)) {
      logger.error("CSV header error. Expected 2 columns")
      throw new IllegalArgumentException("CSV header error. Expected 2 columns")
    }

    lines.headOption match {
      case Some("Cpro Name" :: "Id" :: Nil) =>
        lines.tail.map {
          case supplier :: count :: Nil =>
            SupplierQuotaCount(Agency(supplier), count.toInt)

          case _ =>
            logger.error("CSV body error. Expected 2 columns")
            throw new IllegalArgumentException("CSV body error. Expected 2 columns")
        }

      case Some(other) =>
        val message = s"Unexpected CSV headers [${other.mkString(",")}]. Expected [Cpro Name, Id]"
        logger.error(message)
        throw new IllegalArgumentException(message)

      case None =>
        val message = "CSV has no lines"
        logger.error(message)
        throw new IllegalArgumentException(message)
    }
  }
}

class UsageStore(
  bucket: String,
  config: MediaApiConfig,
  quotaStore: QuotaStore
)(implicit val ec: ExecutionContext) extends BaseStore[String, SupplierUsageStatus](bucket, config) with GridLogging {
  import UsageStore._

  def getUsageStatusForUsageRights(usageRights: UsageRights): Future[SupplierUsageStatus] = {
    usageRights match {
      case agency: Agency => Future.successful(store.get().getOrElse(agency.supplier, { throw NoUsageQuota() }))
      case _ => Future.failed(new Exception("Image is not supplied by Agency"))
    }
  }

  def getUsageStatus(): Future[StoreAccess] = {
    Future.successful(StoreAccess(store.get(), lastUpdated.get()))
  }

  def overQuotaAgencies: List[Agency] = store.get.collect {
    case (_, status) if status.exceeded => status.usage.agency
  }.toList

  def update(): Unit = {
    store.set(fetchUsage)
  }

  private def fetchUsage: Map[String, SupplierUsageStatus] = {
    logger.info("Updating usage store")

    val maybeLines: Option[List[String]] = getLatestS3Stream.map(extractEmail)

    maybeLines match {
      case None => Map.empty
      case Some(lines) =>
        logger.info(s"Last usage file has ${lines.length} lines")
        val summary: List[SupplierQuotaCount] = csvParser(lines)

        def copyAgency(supplier: SupplierQuotaCount, id: String) = Agencies.all.get(id)
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

        val supplierQuota = quotaStore.getQuota

        cleanedSummary
          .groupBy(_.agency.supplier)
          .view
          .mapValues(_.head)
          .mapValues((summary: SupplierQuotaCount) => {
            val quota = summary.agency.id.flatMap(id => supplierQuota.get(id))
            val exceeded = quota.exists(q => summary.count > q.count)
            val fractionOfQuota: Float = quota.map(q => summary.count.toFloat / q.count).getOrElse(0F)

            SupplierUsageStatus(
              exceeded,
              fractionOfQuota,
              summary,
              quota
            )
          }).toMap
    }
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
