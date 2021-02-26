package com.gu.mediaservice.model

import com.gu.mediaservice.lib.logging.{LogMarker, MarkerMap}
import play.api.libs.functional.syntax._
import play.api.libs.json.Reads._
import play.api.libs.json._

case class FileMetadata(
  iptc: Map[String, String]                     = Map(),
  exif: Map[String, String]                     = Map(),
  exifSub: Map[String, String]                  = Map(),
  xmp: Map[String, JsValue]                      = Map(),
  icc: Map[String, String]                      = Map(),
  getty: Map[String, String]                    = Map(),
  colourModel: Option[String]                   = None,
  colourModelInformation: Map[String, String]   = Map()
) {
  def toLogMarker: LogMarker = {
    val fieldCountMarkers = Map (
      "iptcFieldCount" -> iptc.size,
      "exifFieldCount" -> exif.size,
      "exifSubFieldCount" -> exifSub.size,
      "xmpFieldCount" -> xmp.size,
      "iccFieldCount" -> icc.size,
      "gettyFieldCount" -> getty.size,
      "colourModelInformationFieldCount" -> colourModelInformation.size
    )

    val totalFieldCount = fieldCountMarkers.foldLeft(0)(_ + _._2)
    val markers = fieldCountMarkers + ("totalFieldCount" -> totalFieldCount)

    MarkerMap(markers)
  }

  def readXmpHeadStringProp: (String) => Option[String] = (name: String) => {
    val res = xmp.get(name) match {
      case Some(JsString(value)) => Some(value.toString)
      case Some(JsArray(value)) =>
        value.find(_.isInstanceOf[JsString]).map(_.as[String])
      case _ => None
    }
    res
  }
}

object FileMetadata {
  // TODO: reindex all images to make the getty map always present
  // for data consistency, so we can fallback to use the default Reads
  implicit val ImageMetadataReads: Reads[FileMetadata] = (
    (__ \ "iptc").read[Map[String,String]] ~
    (__ \ "exif").read[Map[String,String]] ~
    (__ \ "exifSub").read[Map[String,String]] ~
    (__ \ "xmp").read[Map[String,JsValue]] ~
    (__ \ "icc").readNullable[Map[String,String]].map(_ getOrElse Map()).map(removeLongValues) ~
    (__ \ "getty").readNullable[Map[String,String]].map(_ getOrElse Map()) ~
    (__ \ "colourModel").readNullable[String] ~
    (__ \ "colourModelInformation").readNullable[Map[String,String]].map(_ getOrElse Map())

  )(FileMetadata.apply _)

  private val maximumValueLengthBytes = 5000
  private def removeLongValues = { m:Map[String, String] => {
    val (short, long) =  m.partition(_._2.length <= maximumValueLengthBytes)
    if (long.size>0) {
      short + ("removedFields" -> long.map(_._1).mkString(", "))
    } else {
      m
    }
  } }

  implicit val FileMetadataWrites: Writes[FileMetadata] = (
    (JsPath \ "iptc").write[Map[String,String]] and
      (JsPath \ "exif").write[Map[String,String]] and
      (JsPath \ "exifSub").write[Map[String,String]] and
      (JsPath \ "xmp").write[Map[String,JsValue]] and
      (JsPath \ "icc").write[Map[String,String]].contramap[Map[String, String]](removeLongValues) and
      (JsPath \ "getty").write[Map[String,String]] and
      (JsPath \ "colourModel").writeNullable[String] and
      (JsPath \ "colourModelInformation").write[Map[String,String]]
  )(unlift(FileMetadata.unapply))
}
