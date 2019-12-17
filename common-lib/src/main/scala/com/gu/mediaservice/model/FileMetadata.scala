package com.gu.mediaservice.model

import com.gu.mediaservice.model.FileMetadata.readStringOrListHeadProp
import net.logstash.logback.marker.Markers
import play.api.libs.functional.syntax._
import play.api.libs.json._

import scala.collection.JavaConverters._
import scala.collection.mutable.ArrayBuffer

case class FileMetadata(
                         iptc: Map[String, String] = Map(),
                         exif: Map[String, String] = Map(),
                         exifSub: Map[String, String] = Map(),
                         xmp: Map[String, JsValue] = Map(),
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

  def aggregateMetadataMap(initialMap: Map[String, String]): Map[String, JsValue] = {

    val getNormalisedKeyAndValType: String => (String, String, Int) = (k: String) => {
      val isArrayKey = k.contains("[")
      val isDynamicObject = k.contains("]/")

      val res = if (isDynamicObject){
        val l = k.substring(0, k.indexOf("/"))
        val r = k.substring(k.indexOf("/")+1)
        (l, r, 3)
      } else if (isArrayKey) {
        (k.substring(0, k.indexOf("[")), "", 2)
      } else {
        (k, "", 1)
      }
      res
    }

    val mutableMap = scala.collection.mutable.Map[(String, Int), ArrayBuffer[String]]()

    for (originalKey <- initialMap.keySet) {
      val value = initialMap(originalKey)
      val (procKey, rest, typ) = getNormalisedKeyAndValType(originalKey)
      val normalisedKey: (String, Int) = (procKey, typ)
      if (mutableMap.contains(normalisedKey)) {
        if (rest.nonEmpty) mutableMap(normalisedKey) += rest
        mutableMap(normalisedKey) += value
      } else {
        if (rest.nonEmpty) {
          mutableMap.put(normalisedKey, ArrayBuffer(rest, value))
        } else {
          mutableMap.put(normalisedKey, ArrayBuffer(value))
        }
      }
    }

    val normalisedMap: Map[String, JsValue] = mutableMap.map {
      case (k, v) =>
        if (k._2 == 3){
          val tups = for(i <- 0 until v.length by 2) yield (v(i), JsString(v(i+1)))
          (k._1, JsObject(tups))
        } else {
          val value = if (v.size > 1) JsArray(v.map(JsString)) else JsString(v.head)
          (k._1, value)
        }
    }.toMap

    normalisedMap
  }

  def readStringOrListHeadProp(name: String, genericMap: Map[String, JsValue]): Option[String] = {
    genericMap.get(name).map(prop => {
      prop match {
        case JsString(v) => v
        case JsArray(v) => v.head.toString
        case _ => throw new Exception("sdfsdf")
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

  implicit val ImageMetadataFormatter: Reads[FileMetadata] = (
    (__ \ "iptc").read[Map[String, String]] ~
      (__ \ "exif").read[Map[String, String]] ~
      (__ \ "exifSub").read[Map[String, String]] ~
      (__ \ "xmp").read[Map[String, JsValue]] ~
      (__ \ "icc").readNullable[Map[String, String]].map(_ getOrElse Map()).map(removeLongValues) ~
      (__ \ "getty").readNullable[Map[String, String]].map(_ getOrElse Map()) ~
      (__ \ "colourModel").readNullable[String] ~
      (__ \ "colourModelInformation").readNullable[Map[String, String]].map(_ getOrElse Map())

    ) (FileMetadata.apply _)

  implicit val FileMetadataWrites: Writes[FileMetadata] = (
    (JsPath \ "iptc").write[Map[String, String]] and
      (JsPath \ "exif").write[Map[String, String]] and
      (JsPath \ "exifSub").write[Map[String, String]] and
      (JsPath \ "xmp").write[Map[String, JsValue]] and
      (JsPath \ "icc").write[Map[String, String]].contramap[Map[String, String]](removeLongValues) and
      (JsPath \ "getty").write[Map[String, String]] and
      (JsPath \ "colourModel").writeNullable[String] and
      (JsPath \ "colourModelInformation").write[Map[String, String]]
    ) (unlift(FileMetadata.unapply))
}
