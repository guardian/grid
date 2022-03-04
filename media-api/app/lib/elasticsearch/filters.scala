package lib.elasticsearch

import com.gu.mediaservice.lib.formatting.printDateTime
import com.sksamuel.elastic4s.ElasticDsl
import com.sksamuel.elastic4s.ElasticDsl._
import com.sksamuel.elastic4s.requests.searches.queries.{NestedQuery, Query}
import com.sksamuel.elastic4s.requests.searches.queries.compound.BoolQuery
import com.sksamuel.elastic4s.requests.searches.term.TermQuery
import org.joda.time.DateTime

object filters {

  def and(queries: Iterable[Query]): Query = must(queries)
  def and(first: Query, rest: Query*): Query = must(first +: rest)

  def or(queries: Iterable[Query]): Query = should(queries)
  def or(first: Query, rest: Query*): Query = should(first +: rest)

  def boolTerm(field: String, value: Boolean): TermQuery = termQuery(field, value)

  def date(field: String, from: Option[DateTime], to: Option[DateTime]): Option[Query] =
    if (from.isDefined || to.isDefined) {
      val builder = rangeQuery(field)
      val withFrom = from.fold(builder)(f => builder.gt(printDateTime(f)))
      Some(to.fold(withFrom)(t => withFrom.lt(printDateTime(t))))
    } else {
      None
    }

  def exists(fields: List[String]): Query =
    and(fields.map(f => existsQuery(f): Query))

  def missing(fields: List[String]): Query =
    and(fields.map(f => not(existsQuery(f)): Query))

  def ids(idList: List[String]): Query = idsQuery(idList)

  def bool(): BoolQuery = BoolQuery()

  def mustNot(queries: Query*): Query = ElasticDsl.not(queries)

  def term(field: String, term: String): Query = termQuery(field, term)

  def terms(field: String, terms: List[String]): Query = {
    termsQuery(field, terms)
  }

  def existsOrMissing(field: String, exists: Boolean): Query = if (exists) {
    existsQuery(field)
  } else {
    not(existsQuery(field))
  }

  def anyMissing(fields: List[String]): Query =
    or(fields.map(f => not(existsQuery(f)): Query))

  def not(filter: Query): Query = ElasticDsl.not(filter)

  def mustWithMustNot(mustClause: Query, mustNotClause: Query): Query = {
    bool().must(
      mustClause
    ).withNot(
      mustNotClause
    )
  }

  def nested(path: String, query: Query): NestedQuery = NestedQuery(path, query)
}
