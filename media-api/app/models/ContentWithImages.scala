package models

import com.gu.contentapi.client.model.v1.{Content, SearchResponse}

case class ContentWithImages(contentId: String, webTitle: String, webUrl: String, imageIds: List[String])

object ContentWithImages {

  import play.api.libs.json._

  implicit val contentWithImagesWrites: Writes[ContentWithImages] = Json.writes[ContentWithImages]
  implicit val contentWithImagesReads: Reads[ContentWithImages] = Json.reads[ContentWithImages]

  def fromSearchResponse(content: Content) = {
      val elements = content.blocks.flatMap(_.main).map(_.elements).getOrElse(Nil)
      ContentWithImages(content.id, content.webTitle, content.webUrl, elements.flatMap(_.assets.flatMap(_.file)).toList)
  }
}


case class ContentWithImagesResponse(articles: List[ContentWithImages])

object ContentWithImagesResponse {

  import play.api.libs.json._

  implicit val contentWithImagesResponseWrites: Writes[ContentWithImagesResponse] = Json.writes[ContentWithImagesResponse]
  implicit val contentWithImagesResponseReads: Reads[ContentWithImagesResponse] = Json.reads[ContentWithImagesResponse]
}
