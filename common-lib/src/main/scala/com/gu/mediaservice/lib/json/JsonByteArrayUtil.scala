package com.gu.mediaservice.lib.json

import java.io.{ByteArrayInputStream, ByteArrayOutputStream}
import java.nio.charset.StandardCharsets
import java.util.zip.{GZIPInputStream, GZIPOutputStream}

import com.gu.mediaservice.lib.logging.GridLogging
import play.api.libs.json._

import scala.io.Source.fromInputStream

object JsonByteArrayUtil extends PlayJsonHelpers with GridLogging {
  private val compressionMarkerByte: Byte = 0x00.toByte

  private def compress(bytes: Array[Byte]): Array[Byte] = {
    val outputStream = new ByteArrayOutputStream()
    val zipOutputStream = new GZIPOutputStream(outputStream)
    zipOutputStream.write(bytes)
    zipOutputStream.close()
    outputStream.close()
    val compressedBytes = outputStream.toByteArray
    compressionMarkerByte +: compressedBytes
  }

  private def decompress(bytes: Array[Byte]): Array[Byte] = {
    val bytesWithoutCompressionMarker = bytes.tail
    val byteStream = new ByteArrayInputStream(bytesWithoutCompressionMarker)
    val inputStream = new GZIPInputStream(byteStream)
    val decompressedBytes = fromInputStream(inputStream).mkString.getBytes
    byteStream.close()
    inputStream.close()
    decompressedBytes
  }

  def hasCompressionMarker(bytes: Array[Byte]) = bytes.head == compressionMarkerByte

  def toByteArray[T](obj: T)(implicit writes: Writes[T]): Array[Byte] = compress(Json.toBytes(Json.toJson(obj)))

  def fromByteArray[T](bytes: Array[Byte])(implicit reads: Reads[T]): Either[JsError, T] = {
    val string = new String(
      if (hasCompressionMarker(bytes)) decompress(bytes) else bytes,
      StandardCharsets.UTF_8
    )

    Json.parse(string).validate[T] match {
      case JsSuccess(obj, _) => Right(obj)
      case e: JsError => Left(e)
    }
  }
}
