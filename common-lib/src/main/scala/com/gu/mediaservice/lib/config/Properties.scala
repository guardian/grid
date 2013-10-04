package com.gu.mediaservice.lib.config

import java.io.{InputStream, FileInputStream}
import java.net.URL
import scala.collection.JavaConverters._


object Properties {

  def fromFile(file: String): Map[String, String] =
    fromStream(new FileInputStream(file))

  def fromURL(url: URL): Map[String, String] =
    fromStream(url.openStream)

  def fromStream(stream: InputStream): Map[String, String] = {
    val props = new java.util.Properties
    try props.load(stream) finally stream.close()
    props.asScala.toMap
  }
}
