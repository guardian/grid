package lib

import com.gu.contentapi.client.GuardianContentClient
import com.gu.contentapi.client.model.v1.Content
import org.joda.time.{DateTime, DateTimeZone}

trait ContentHelpers {
  def getContentFirstPublished(content: Content) = for {
    fields <- content.fields
    firstPublicationDate <- fields.firstPublicationDate
    date = new DateTime(firstPublicationDate.iso8601, DateTimeZone.UTC)
  } yield date

}

class LiveContentApi(config: UsageConfig) extends ContentApiRequestBuilder(config) {
  override val targetUrl = config.capiLiveUrl
}

class ContentApiRequestBuilder(config: UsageConfig) extends GuardianContentClient(apiKey = config.capiApiKey) with ContentHelpers

