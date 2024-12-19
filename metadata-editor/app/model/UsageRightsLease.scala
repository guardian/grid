package model

import com.gu.mediaservice.model._
import play.api.ConfigLoader
import play.api.libs.json._
import scala.collection.JavaConverters._
import scala.util.{Failure, Success, Try}
import java.time.{LocalDate, Period}

case class UsageRightsLease(
   category: String,
   `type`: String,
   startDate: String,
   duration: Option[Int],
   notes: Option[String]
)

object UsageRightsLease {

  def getLeasesForSpec(u: UsageRightsSpec, leases: Seq[UsageRightsLease]): Seq[UsageRightsLease] = leases.filter(_.category == u.category)

  implicit val writes: Writes[UsageRightsLease] = Json.writes[UsageRightsLease]

  implicit val configLoader: ConfigLoader[Seq[UsageRightsLease]] = {
    ConfigLoader(_.getConfigList).map(
      _.asScala.map(config => {

        val categoryId = if (config.hasPath("category")) {
          config.getString("category")
        } else ""

        val leaseType = if (config.hasPath("type")) {
          config.getString("type")
        } else ""

        val startDate = if (config.hasPath("startDate")) {
          config.getString("startDate")
        } else ""

        val duration = if (config.hasPath("duration")) {
          Some(config.getInt("duration"))
        } else None

        val notes = if (config.hasPath("notes")) {
          Some(config.getString("notes"))
        } else None

        UsageRightsLease (
          category = categoryId,
          `type` = leaseType,
          startDate = startDate,
          duration = duration,
          notes = notes
        )

      }))
  }

}
