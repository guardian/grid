package lib.elasticsearch.impls.elasticsearch6

import com.gu.mediaservice.lib.formatting.printDateTime
import com.sksamuel.elastic4s.http.ElasticDsl._
import com.sksamuel.elastic4s.searches.queries.Query
import org.joda.time.DateTime

object filters {

  def and(queries: Query*): Query = must(queries)

  def or(queries: Query*): Query = should(queries)

  def boolTerm(field: String, value: Boolean): Query = termQuery(field, value)

  def date(field: String, from: Option[DateTime], to: Option[DateTime]): Option[Query] =
    if (from.isDefined || to.isDefined) {
      val builder = rangeQuery(field)
      for (f <- from) builder.gt(printDateTime(f))
      for (t <- to) builder.lt(printDateTime(t))
      Some(builder)
    } else {
      None
    }

  def mustNot(queries: Query*): Query = not(queries)

  def term(field: String, term: String): Query = termQuery(field, term)

  def existsOrMissing(field: String, exists: Boolean): Query = exists match {
    case true  => existsQuery(field)
    case false => not(existsQuery(field))
  }

}