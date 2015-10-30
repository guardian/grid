package model

import com.gu.contentapi.client.model.v1.Content


case class ContentDetails(
  webTitle: String,
  webUrl: String,
  sectionId: String
) {
  def toMap = Map(
    "webTitle" -> webTitle,
    "webUrl" -> webUrl,
    "sectionId" -> sectionId
  )
}

object ContentDetails {
  def build(content: Content): ContentDetails = {
    ContentDetails(
      content.webTitle,
      content.webUrl,
      content.sectionId.getOrElse("none")
    )
  }
}
