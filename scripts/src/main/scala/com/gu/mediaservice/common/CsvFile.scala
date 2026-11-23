package com.gu.mediaservice.common

import scala.io.Source

object CsvFile {
  def readFirstColumn(csvPath: String): List[String] = {
    val source = Source.fromFile(csvPath)
    try {
      source
        .getLines()
        .drop(1)
        .map(_.takeWhile(_ != ',').trim)
        .filter(_.nonEmpty)
        .distinct
        .toList
    } finally {
      source.close()
    }
  }
}
