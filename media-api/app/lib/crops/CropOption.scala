package lib.crops

import play.api.libs.json.{Json, OFormat}

case class CropOption(key: String, ratio: String, ratioString: String)

object CropOption {
  implicit val jf: OFormat[CropOption] = Json.format[CropOption]
  val supported = List(
    CropOption("landscape", "5 / 4", "5:4"),
    CropOption("portrait", "4 / 5", "4:5"),
    CropOption("video", "16 / 9", "16:9"),
    CropOption("square", "1", "1:1"),
  )
}
