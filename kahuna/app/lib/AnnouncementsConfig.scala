package lib

import play.api.ConfigLoader
import play.api.libs.json._
import scala.collection.JavaConverters._
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

  implicit val writes: Writes[Announcement] = Json.writes[Announcement]

  implicit val configLoader: ConfigLoader[Seq[Announcement]] = {
      ConfigLoader(_.getConfigList).map(
        _.asScala.map(config => {

          val endDate = if (config.hasPath("endDate")) {
            LocalDate.parse(config.getString("endDate"))
          } else {
            LocalDate.now().plus(Period.ofYears(1))
          }

          val announceUrl = if (config.hasPath("url")) {
            config.getString("url")
          } else ""

          val urlText = if (config.hasPath("urlText")) {
            config.getString("urlText")
          } else ""

          Announcement(config.getString("announceId"),
            config.getString("description"),
            endDate,
            announceUrl,
            urlText,
            config.getString("category"),
            config.getString("lifespan")
          )
        }))
  }

}
