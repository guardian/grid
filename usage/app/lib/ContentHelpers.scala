package lib

import com.gu.contentapi.client.model.v1.Content
import org.joda.time.{DateTime, DateTimeZone}

object ContentHelpers {
  def getContentFirstPublished(content: Content): Option[DateTime] = for {
    fields <- content.fields
    firstPublicationDate <- fields.firstPublicationDate
    date = new DateTime(firstPublicationDate.iso8601, DateTimeZone.UTC)
  } yield date
}
