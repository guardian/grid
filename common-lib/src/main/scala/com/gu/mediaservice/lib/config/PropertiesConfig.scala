package com.gu.mediaservice.lib.config

import java.io.FileInputStream
import scala.collection.JavaConverters._


object PropertiesConfig {

  def fromFile(file: String): Map[String, String] = {
    val props = new java.util.Properties
    val is = new FileInputStream(file)
    props.load(is)
    is.close()
    props.asScala.toMap
  }

}
