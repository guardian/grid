package lib
import com.gu.contentapi.client._
import com.gu.contentapi.client.model.SearchQuery
import models.ContentWithImages

import scala.concurrent.{ExecutionContext, Future}

class ContentApi(config: MediaApiConfig)
  extends GuardianContentClient(apiKey = config.capiApiKey)  {

  override val targetUrl: String = config.capiLiveUrl

  def imageSearchQuery(imageId: String): SearchQuery = {
    SearchQuery()
      .q(imageId)
      .queryFields("body,main,thumbnail")
      .showBlocks("all")
  }

  def findContentUsingImage(imageId: String)(implicit context: ExecutionContext): Future[List[ContentWithImages]] = {
    val imageSearchQ = imageSearchQuery(imageId)
    paginateAccum(imageSearchQ)(sr => {
      ContentWithImages.fromSearchResponse(sr)
    }, (l1: List[ContentWithImages], l2: List[ContentWithImages]) => l1 ++ l2)
  }
}
