package com.gu.mediaservice.lib.config

import java.io.{File, InputStream, FileInputStream}
import java.net.URL
import org.apache.commons.io.IOUtils

import scala.collection.JavaConverters._


object Properties {

  def fromFile(file: File): Map[String, String] =
    fromStream(new FileInputStream(file))

  def fromPath(file: String): Map[String, String] =
    fromStream(new FileInputStream(file))

  def fromURL(url: URL): Map[String, String] =
    fromStream(url.openStream)

  def fromString(string: String): Map[String, String] =
    fromStream(IOUtils.toInputStream(string, "UTF-8"))

  def fromStream(stream: InputStream): Map[String, String] = {
    val props = new java.util.Properties
    try props.load(stream) finally stream.close()
    props.asScala.toMap
  }
}
