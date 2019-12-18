package com.gu.mediaservice.model

import net.logstash.logback.marker.Markers
import play.api.libs.json._
import play.api.libs.functional.syntax._

import scala.collection.JavaConverters._

import FileMetadata._

case class KvPair(key: String, values: JsValue)

case class FileMetadata(
  iptc: Map[String, String]                     = Map(),
  exif: Map[String, String]                     = Map(),
  exifSub: Map[String, String]                  = Map(),
  xmp: Seq[KvPair]                      = Seq(),
  icc: Map[String, String]                      = Map(),
  getty: Map[String, String]                    = Map(),
  colourModel: Option[String]                   = None,
  colourModelInformation: Map[String, String]   = Map()
) {
  def toLogMarker = {
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

    Markers.appendEntries(markers.asJava)
  }

  def readXmpProp(name: String): Option[String] = readStringOrListHeadProp(name, this.xmp)
}

object FileMetadata {
  // TODO: reindex all images to make the getty map always present
  // for data consistency, so we can fallback to use the default Reads

  def readStringOrListHeadProp(name: String, tups: Seq[KvPair]): Option[String] = {
    val genericMap = tups.map(t => {
      (t.key, t.values)
    }).toMap
    genericMap.get(name).map(prop => {
      prop match {
        case JsString(v) => v
        case JsArray(v) => v.head.toString
        case _ => throw new Exception("sdfsdf")
      }
    })
  }

  implicit val KvPairFormatter = Json.format[KvPair]

  implicit val ImageMetadataReads: Reads[FileMetadata] = (
    (__ \ "iptc").read[Map[String,String]] ~
    (__ \ "exif").read[Map[String,String]] ~
    (__ \ "exifSub").read[Map[String,String]] ~
    (__ \ "xmp").read[Seq[KvPair]] ~
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
      (JsPath \ "xmp").write[Seq[KvPair]] and
      (JsPath \ "icc").write[Map[String,String]].contramap[Map[String, String]](removeLongValues) and
      (JsPath \ "getty").write[Map[String,String]] and
      (JsPath \ "colourModel").writeNullable[String] and
      (JsPath \ "colourModelInformation").write[Map[String,String]]
  )(unlift(FileMetadata.unapply))
}
