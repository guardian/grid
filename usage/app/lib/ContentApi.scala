package lib

import com.gu.contentapi.client.GuardianContentClient
import com.gu.contentapi.client.model.v1.Content
import org.joda.time.{DateTime, DateTimeZone}

class LiveContentApi(override val targetUrl: String, apiKey: String) extends GuardianContentClient(apiKey) {
  def getContentFirstPublished(content: Content) = for {
    fields <- content.fields
    firstPublicationDate <- fields.firstPublicationDate
    date = new DateTime(firstPublicationDate.iso8601, DateTimeZone.UTC)
  } yield date
}

