package lib.elasticsearch

import com.gu.mediaservice.lib.elasticsearch.IndexSettings
import lib.querysyntax._
import org.elasticsearch.index.query.{MatchQueryBuilder, MultiMatchQueryBuilder}
import org.elasticsearch.index.query.QueryBuilders._


class QueryBuilder(matchFields: Seq[String]) {
  case class InvalidQuery(message: String) extends Exception(message)

  // For some sad reason, there was no helpful alias for this in the ES library
  def multiMatchPhraseQuery(value: String, fields: Seq[String]) =
    new MultiMatchQueryBuilder(value, fields: _*).`type`(MultiMatchQueryBuilder.Type.PHRASE)

  def makeMultiQuery(value: Value, fields: Seq[String]) = value match {
    // Force AND operator else it will only require *any* of the words, not *all*
    case Words(string) => multiMatchQuery(string, fields: _*)
                          .operator(MatchQueryBuilder.Operator.AND)
                          .`type`(MultiMatchQueryBuilder.Type.CROSS_FIELDS)
                          .analyzer(IndexSettings.enslishSStemmerAnalyzerName)
    case Phrase(string) => multiMatchPhraseQuery(string, fields)
    // That's OK, we only do date queries on a single field at a time
    case DateRange(start, end) => throw InvalidQuery("Cannot do multiQuery on date range")
  }

  def makeQueryBit(condition: Match) = condition.field match {
    case AnyField              => makeMultiQuery(condition.value, matchFields)
    case MultipleField(fields) => makeMultiQuery(condition.value, fields)
    case SingleField(field)    => condition.value match {
      // Force AND operator else it will only require *any* of the words, not *all*
      case Words(value)  => matchQuery(field, value).operator(MatchQueryBuilder.Operator.AND)
      case Phrase(value) => matchPhraseQuery(field, value)
      case DateRange(start, end) => rangeQuery(field).from(start.toString()).to(end.toString())
    }
  }

  def makeQuery(conditions: List[Condition]) = conditions match {
    case Nil      => matchAllQuery
    case condList =>
      condList.foldLeft(boolQuery) {
        case (query, Negation(cond)    ) => query.mustNot(makeQueryBit(cond))
        case (query, cond @ Match(_, _)) => query.must(makeQueryBit(cond))
      }
  }

}
