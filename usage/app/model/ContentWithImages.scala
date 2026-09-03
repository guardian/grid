package model

import com.gu.contentapi.client.model.v1.SearchResponse

case class ContentWithImages(contentId: String, imageIds: List[String])


object ContentWithImages {
  def fromSearchResponse(searchResult: SearchResponse) = {
    // To validate -> do we want to filter out only images with the specific imageId? Or do we want to return all images in the content? For now, we are returning all images in the content.
     searchResult.results.map(c => {
      val elements = c.blocks.flatMap(_.main).map(_.elements).getOrElse(Nil)
      ContentWithImages(c.id, elements.flatMap(_.assets.flatMap(_.file)).toList)
    }).toList

  }
}
