package com.gu.mediaservice.model

import play.api.libs.json._

sealed trait DigitalUsageMetadata {
  val url: String
  val title: String
  def toMap: Map[String, String]
}

case class ArticleUsageMetadata (
  webUrl: String,
  webTitle: String,
  sectionId: String,
  composerUrl: Option[String] = None
) extends DigitalUsageMetadata {
  override val url: String = webUrl
  override val title: String = webTitle

  private val placeholderWebTitle = "No title given"
  private val dynamoSafeWebTitle = if(webTitle.isEmpty) placeholderWebTitle else webTitle

  override def toMap: Map[String, String] = Map(
    "webTitle" -> dynamoSafeWebTitle,
    "webUrl" -> webUrl,
    "sectionId" -> sectionId
  ) ++ composerUrl.map("composerUrl" -> _)
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
