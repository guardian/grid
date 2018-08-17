package com.gu.mediaservice.lib.config

import java.io.{File, FileInputStream, InputStream}
import java.net.URL

import scala.collection.JavaConverters._

object Properties {

  def fromFile(file: File): Map[String, String] =
    fromStream(new FileInputStream(file))

  def fromPath(file: String): Map[String, String] = {
    try {
      fromStream(new FileInputStream(file))
    } catch {
      case e: Exception =>
        println(s"Exception thrown when trying to create FileInputStream: $e")
        Map.empty
    }
  }

  def fromURL(url: URL): Map[String, String] =
    fromStream(url.openStream)

  def fromStream(stream: InputStream): Map[String, String] = {
    val props = new java.util.Properties
    try props.load(stream) finally stream.close()
    props.asScala.toMap
  }
}
