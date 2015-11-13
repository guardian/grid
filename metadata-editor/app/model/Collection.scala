package model

import org.joda.time.DateTime
import play.api.libs.json._

case class Collection(path: List[String], paradata: Paradata)
object Collection {
  implicit def formats: Format[Collection] = Json.format[Collection]
}

case class Paradata(who: String, when: DateTime)
object Paradata {
  implicit def formats: Format[Paradata] = Json.format[Paradata]
  implicit val dateWrites = Writes.jodaDateWrites("yyyy-MM-dd'T'HH:mm:ss.SSSZ")
  implicit val dateReads = Reads.jodaDateReads("yyyy-MM-dd'T'HH:mm:ss.SSSZ")
}
