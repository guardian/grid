package com.gu.mediaservice.lib.elasticsearch

import com.gu.mediaservice.lib.formatting.printDateTime
import com.sksamuel.elastic4s.ElasticDsl
import com.sksamuel.elastic4s.ElasticDsl._
import com.sksamuel.elastic4s.requests.searches.queries.compound.BoolQuery
import com.sksamuel.elastic4s.requests.searches.queries.{NestedQuery, Query}
import com.sksamuel.elastic4s.requests.searches.term.TermQuery
import org.joda.time.DateTime
import scalaz.NonEmptyList
import scalaz.syntax.foldable1._

object filters {

  def and(queries: Query*): Query = must(queries)

  def or(queries: Query*): Query = should(queries)

  def or(queries: NonEmptyList[Query]): Query = {
    should(queries.toList: _*)
  }

  def boolTerm(field: String, value: Boolean): TermQuery = termQuery(field, value)

  /**
   * Range query based on dates
   * @param field Field name to query
   * @param from Lower bound for date (exclusive)
   * @param to Upper bound for date (exclusive)
   * @return Suitable query
   */
  def date(field: String, from: DateTime, to: DateTime): Query =
    rangeQuery(field).gt(printDateTime(from)).lt(printDateTime(to))

  /**
   * Range query based on dates - handles optional to and from
   * @param field Field name to query
   * @param from Lower bound for date (exclusive)
   * @param to Upper bound for date (exclusive)
   * @return Suitable query if at least one of `from` and `to` is defined; otherwise nothing
   */
  def date(field: String, from: Option[DateTime], to: Option[DateTime]): Option[Query] =
    if (from.isDefined || to.isDefined) {
      val builder = rangeQuery(field)
      val withFrom = from.fold(builder)(f => builder.gt(printDateTime(f)))
      Some(to.fold(withFrom)(t => withFrom.lt(printDateTime(t))))
    } else {
      None
    }

  def exists(fields: NonEmptyList[String]): Query =
    fields.map(f => existsQuery(f): Query).foldRight1(and(_, _))

  def missing(fields: NonEmptyList[String]): Query =
    fields.map(f => not(existsQuery(f)): Query).foldRight1(and(_, _))

  def ids(idList: List[String]): Query = idsQuery(idList)

  def bool() = BoolQuery()

  def mustNot(queries: Query*): Query = ElasticDsl.not(queries)

  def term(field: String, term: String): Query = termQuery(field, term)
  def term(field: String, term: Int): Query = termQuery(field, term)

  def terms(field: String, terms: NonEmptyList[String]): Query = {
    termsQuery(field, terms.list.toList)
  }

  def wildcard(field: String, value: String): Query = wildcardQuery(field, value)

  def existsOrMissing(field: String, exists: Boolean): Query = if (exists) {
    existsQuery(field)
  } else {
    not(existsQuery(field))
  }

  def anyMissing(fields: NonEmptyList[String]): Query =
    fields.map(f => not(existsQuery(f)): Query).foldRight1(or(_, _))

  def not(filter: Query): Query = {
    ElasticDsl.not(filter)
  }

  def mustWithMustNot(mustClause: Query, mustNotClause: Query): Query = {
    bool().must(
      mustClause
    ).withNot(
      mustNotClause
    )
  }

  def nested(path: String, query: Query) = NestedQuery(path, query)
}
