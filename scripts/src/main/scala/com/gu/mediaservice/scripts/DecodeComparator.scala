package com.gu.mediaservice.scripts

import com.gu.mediaservice.lib.net.URI
import play.api.libs.json.{JsError, JsSuccess, Json}

import java.io.File
import scala.io.Source

/**
  * Given a JSON lines file output from BucketMetadata this will verify that metadata is not changed when being
  * passed through a URI decode function. This was to check that it is safe to deploy
  * https://github.com/guardian/grid/pull/3165
  */
object DecodeComparator {
  def apply(args: List[String]): Unit = {
    args match {
      case fileName :: Nil => compare(new File(fileName))
      case as => throw new IllegalArgumentException("Usage: DecodeComparator <inputFile.json>")
    }
  }

  def compare(file: File): Unit = {
    val source = Source.fromFile(file)
    try {
      source.getLines().foreach { line =>
        Json.fromJson[ObjectMetadata](Json.parse(line)) match {
          case JsError(errors) => System.err.println(s"Couldn't parse JSON $line")
          case JsSuccess(metadata, _) =>
            metadata.metadata.toList.foreach{ case (key, value) =>
              val decodedValue = URI.decode(value)
              if (value != decodedValue) System.out.println(s"Difference between $key '$value' and '$decodedValue'")
            }
        }
      }
    } finally {
      source.close()
    }
  }
}
