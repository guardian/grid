package com.gu.mediaservice.model

import com.gu.mediaservice.model.FileMetadata.{StringOrStrings, readStringOrListHeadProp}
import net.logstash.logback.marker.Markers
import play.api.libs.functional.syntax._
import play.api.libs.json._

import scala.collection.JavaConverters._
import scala.collection.mutable.ArrayBuffer

case class FileMetadata(
                         iptc: Map[String, String] = Map(),
                         exif: Map[String, String] = Map(),
                         exifSub: Map[String, String] = Map(),
                         xmp: Map[String, StringOrStrings] = Map(),
                         icc: Map[String, String] = Map(),
                         getty: Map[String, String] = Map(),
                         colourModel: Option[String] = None,
                         colourModelInformation: Map[String, String] = Map()
                       ) {
  def toLogMarker = {
    val fieldCountMarkers = Map(
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
  type StringOrStrings = Either[String, List[String]]

  def aggregateMetadataMap(initialMap: Map[String, String]): Map[String, StringOrStrings] = {

    val normaliseKeys = (k: String) => {
      val isArrayKey = k.contains("[")
      if (isArrayKey) {
        val isSimpleArrayKey = k.indexOf("]") == k.length
        if (isSimpleArrayKey) {
          k.substring(0, k.indexOf("["))
        } else {
          val left = k.substring(0, k.indexOf("["))
          val right = k.substring(k.indexOf("]")+1)
          left + right
        }
      } else {
        k
      }
    }

    val mutableMap = scala.collection.mutable.Map[String, ArrayBuffer[String]]()

    for (originalKey <- initialMap.keySet) {
      val value = initialMap(originalKey)
      val normalisedKey = normaliseKeys(originalKey)
      if (mutableMap.contains(normalisedKey)) {
        mutableMap(normalisedKey) += value
      } else {
        mutableMap.put(normalisedKey, ArrayBuffer(value))
      }
    }

    val normalisedMap: Map[String, StringOrStrings] = mutableMap.map {
      case (k, v) =>
        val value = if (v.size > 1) scala.Right(v.toList) else scala.Left(v.head)
        (k, value)
    }.toMap

    normalisedMap
  }

  def readStringOrListHeadProp(name: String, genericMap: Map[String, StringOrStrings]): Option[String] = {
    genericMap.get(name).map(prop => {
      prop match {
        case scala.Left(v) => v
        case scala.Right(v) => v.head
      }
    })
  }

}

object FileMetadataFormatters {

  private val maximumValueLengthBytes = 5000

  private def removeLongValues = { m: Map[String, String] => {
    val (short, long) = m.partition(_._2.length <= maximumValueLengthBytes)
    if (long.size > 0) {
      short + ("removedFields" -> long.map(_._1).mkString(", "))
    } else {
      m
    }
  }
  }

  implicit val StringOrStringsReads: Reads[StringOrStrings] = {
    case JsString(s) => JsSuccess(Left(s))
    case JsArray(l) =>
      val strings = l.map(_.as[String]).toList
      JsSuccess(scala.Right(strings))
    case _ => throw new Exception("Invalid json value")
  }

  implicit val StringOrStringsWrites: Writes[StringOrStrings] = (o: StringOrStrings) => o match {
    case scala.Right(v) => Json.toJson(v)
    case scala.Left(v) => Json.toJson(v)
  }

  implicit val ImageMetadataFormatter: Reads[FileMetadata] = (
    (__ \ "iptc").read[Map[String, String]] ~
      (__ \ "exif").read[Map[String, String]] ~
      (__ \ "exifSub").read[Map[String, String]] ~
      (__ \ "xmp").read[Map[String, StringOrStrings]] ~
      (__ \ "icc").readNullable[Map[String, String]].map(_ getOrElse Map()).map(removeLongValues) ~
      (__ \ "getty").readNullable[Map[String, String]].map(_ getOrElse Map()) ~
      (__ \ "colourModel").readNullable[String] ~
      (__ \ "colourModelInformation").readNullable[Map[String, String]].map(_ getOrElse Map())

    ) (FileMetadata.apply _)

  implicit val FileMetadataWrites: Writes[FileMetadata] = (
    (JsPath \ "iptc").write[Map[String, String]] and
      (JsPath \ "exif").write[Map[String, String]] and
      (JsPath \ "exifSub").write[Map[String, String]] and
      (JsPath \ "xmp").write[Map[String, StringOrStrings]] and
      (JsPath \ "icc").write[Map[String, String]].contramap[Map[String, String]](removeLongValues) and
      (JsPath \ "getty").write[Map[String, String]] and
      (JsPath \ "colourModel").writeNullable[String] and
      (JsPath \ "colourModelInformation").write[Map[String, String]]
    ) (unlift(FileMetadata.unapply))
}
