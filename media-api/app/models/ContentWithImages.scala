package models

import com.gu.contentapi.client.model.v1.SearchResponse

case class ContentWithImages(contentId: String, webTitle: String, webUrl: String, imageIds: List[String])

object ContentWithImages {

  import play.api.libs.json._

  implicit val contentWithImagesWrites: Writes[ContentWithImages] = Json.writes[ContentWithImages]
  implicit val contentWithImagesReads: Reads[ContentWithImages] = Json.reads[ContentWithImages]

  def fromSearchResponse(searchResult: SearchResponse) = {
    // To validate -> do we want to filter out only images with the specific imageId? Or do we want to return all images in the content? For now, we are returning all images in the content.
    searchResult.results.map(c => {
      val elements = c.blocks.flatMap(_.main).map(_.elements).getOrElse(Nil)
      ContentWithImages(c.id, c.webTitle, c.webUrl, elements.flatMap(_.assets.flatMap(_.file)).toList)
    }).toList
  }
}


case class ContentWithImagesResponse(articles: List[ContentWithImages])

object ContentWithImagesResponse {

  import play.api.libs.json._

  implicit val contentWithImagesResponseWrites: Writes[ContentWithImagesResponse] = Json.writes[ContentWithImagesResponse]
  implicit val contentWithImagesResponseReads: Reads[ContentWithImagesResponse] = Json.reads[ContentWithImagesResponse]
}
