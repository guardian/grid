package lib

import play.api.ConfigLoader
import play.api.libs.json._
import scala.collection.JavaConverters._
import scala.util.{Try, Success, Failure}
import java.time.{LocalDate, Period}

case class Announcement(
   announceId: String,
   description: String,
   endDate: LocalDate,
   url: String,
   urlText: String,
   category: String,
   lifespan: String
)

object Announcement {

  val announceCategory = Set("announcement", "information", "warning", "error", "success")
  val announceLifespan = Set("transient", "session", "persistent")

  implicit val writes: Writes[Announcement] = Json.writes[Announcement]

  implicit val configLoader: ConfigLoader[Seq[Announcement]] = {
      ConfigLoader(_.getConfigList).map(
        _.asScala.map(config => {

          val endDate = if (config.hasPath("endDate")) {
            val dte = Try(LocalDate.parse(config.getString("endDate")))
            dte match {
              case Success(value) => value
              case Failure(_) => LocalDate.now().plus(Period.ofYears(1))
            }
          } else {
            LocalDate.now().plus(Period.ofYears(1))
          }

          val announceUrl = if (config.hasPath("url")) {
            config.getString("url")
          } else ""

          val urlText = if (config.hasPath("urlText")) {
            config.getString("urlText")
          } else ""

          val category = if (announceCategory.contains(config.getString("category"))) {
            config.getString("category")
          } else "announcement" // the expected category applicationConf announcements

          val lifespan = if (announceLifespan.contains(config.getString("lifespan"))) {
            config.getString("lifespan")
          } else "persistent" // the expected lifespan for applicationConf announcements

          Announcement(config.getString("announceId"),
            config.getString("description"),
            endDate,
            announceUrl,
            urlText,
            category,
            lifespan
          )
        }))
  }

}
