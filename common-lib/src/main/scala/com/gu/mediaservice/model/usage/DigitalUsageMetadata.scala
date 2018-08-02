package com.gu.mediaservice.model

import java.net.URI
import play.api.libs.json._
import com.gu.mediaservice.syntax._

sealed trait DigitalUsageMetadata {
  val url: URI
  val title: String
  def toMap: Map[String, String]
}

case class ArticleUsageMetadata (
  webUrl: URI,
  webTitle: String,
  sectionId: String,
  composerUrl: Option[URI] = None
) extends DigitalUsageMetadata {
  override val url: URI = webUrl
  override val title: String = webTitle

  private val placeholderWebTitle = "No title given"
  private val dynamoSafeWebTitle = if(webTitle.isEmpty) placeholderWebTitle else webTitle

  override def toMap: Map[String, String] = Map(
    "webUrl" -> webUrl.toString,
    "webTitle" -> dynamoSafeWebTitle,
    "sectionId" -> sectionId
  ) ++ composerUrl.map("composerUrl" -> _.toString)
}

object ArticleUsageMetadata {
  implicit val reader: Reads[ArticleUsageMetadata] = Json.reads[ArticleUsageMetadata]
  val writer: Writes[ArticleUsageMetadata] = Json.writes[ArticleUsageMetadata]
}

object DigitalUsageMetadata {
  implicit val reads: Reads[DigitalUsageMetadata] =
    __.read[ArticleUsageMetadata].map(metadata => metadata: DigitalUsageMetadata)

  implicit val writes: Writes[DigitalUsageMetadata] = Writes[DigitalUsageMetadata]{
    case metadata: ArticleUsageMetadata => ArticleUsageMetadata.writer.writes(metadata)
  }
}
