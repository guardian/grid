package lib

import play.api.ConfigLoader
import play.api.libs.json._
import scala.collection.JavaConverters._

case class InterimFilterOption(
        id: String,
        label: String,
        mapping: String,
        payable: String
)

object InterimFilterOption {

  implicit val writes: Writes[InterimFilterOption] = Json.writes[InterimFilterOption]

  implicit val configLoader: ConfigLoader[Seq[InterimFilterOption]] = {
    ConfigLoader(_.getConfigList).map(
      _.asScala.map(config => {
        InterimFilterOption(
          id = config.getString("id"),
          label = config.getString("label"),
          mapping = config.getString("mapping"),
          payable = config.getString("payable")
        )
      }))
  }

}
