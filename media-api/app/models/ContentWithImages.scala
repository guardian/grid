package models

case class ContentWithImages(contentId: String, images: List[String])

object ContentWithImages {

  import play.api.libs.json._

  implicit val contentWithImagesWrites: Writes[ContentWithImages] = Json.writes[ContentWithImages]
  implicit val contentWithImagesReads: Reads[ContentWithImages] = Json.reads[ContentWithImages]
}


case class ContentWithImagesResponse(articles: List[ContentWithImages])

object ContentWithImagesResponse {

  import play.api.libs.json._

  implicit val contentWithImagesResponseWrites: Writes[ContentWithImagesResponse] = Json.writes[ContentWithImagesResponse]
  implicit val contentWithImagesResponseReads: Reads[ContentWithImagesResponse] = Json.reads[ContentWithImagesResponse]
}
