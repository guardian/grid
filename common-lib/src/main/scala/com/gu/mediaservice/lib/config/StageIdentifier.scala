package com.gu.mediaservice.lib.config

import java.io.File

import scala.io.Source.fromFile

class StageIdentifier {
  final val stage: String =
    loadStageFile("/etc/grid/stage") orElse loadStageFile("/etc/gu/stage") getOrElse "DEV"

  val isProd: Boolean = stage == "PROD"
  val isDev: Boolean = stage == "DEV"

  private def loadStageFile(fileName: String): Option[String] = {
    val file = new File(fileName)
    if (file.exists) {
      val source = fromFile(file)
      val stage = try {
        source.mkString.trim
      } finally {
        source.close()
      }
      Some(stage.trim)
    } else None
  }
}
