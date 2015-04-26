package lib.querysyntax

import scala.util.Try

import org.joda.time.DateTime
import org.joda.time.format.{DateTimeFormatter, DateTimeFormat}
import org.parboiled2._

class QuerySyntax(val input: ParserInput) extends Parser {
  def Query = rule { Expression ~ EOI }

  def Expression = rule { zeroOrMore(Term) separatedBy Whitespace }

  def Term = rule { NegatedFilter | Filter }

  def NegatedFilter = rule { '-' ~ Filter ~> Negation }


  def Filter = rule {
    ScopedMatch ~> Match | HashMatch |
    DateMatch ~> Match | AtMatch |
    AnyMatch
  }

  def ScopedMatch = rule { MatchField ~ ':' ~ MatchValue }
  def HashMatch = rule { '#' ~ MatchValue ~> (label => Match(SingleField("labels"), label)) }

  def MatchField = rule { capture(AllowedFieldName) ~> resolveNamedField _ }

  def AllowedFieldName = rule {
    "uploader" |
    "location" | "city" | "state" | "country" | "in" |
    "byline" | "by" | "photographer" |
    "description" |
    "credit" |
    "copyright" |
    "source" |
    "keyword" |
    "label"
  }

  def resolveNamedField(name: String): Field = name match {
    case "uploader"            => SingleField("uploadedBy")
    case "in"                  => MultipleField(List("location", "city", "state", "country"))
    case "by" | "photographer" => SingleField("byline")
    case "location"            => SingleField("subLocation")
    case "label"               => SingleField("labels")
    case "keyword"             => SingleField("keywords")
    case fieldName             => SingleField(fieldName)
  }


  def AnyMatch = rule { MatchValue ~> (v => Match(AnyField, v)) }


  def MatchValue = rule { QuotedString ~> Phrase | String ~> Words }

  def String = rule { capture(Chars) }


  // TODO: also comparisons
  def DateMatch = rule { MatchDateField ~ ':' ~ MatchDateValue }

  def AtMatch = rule { '@' ~ MatchDateValue ~> (range => Match(SingleField("uploadTime"), range)) }

  def MatchDateField = rule { capture(AllowedDateFieldName) ~> resolveDateField _ }

  def resolveDateField(name: String): Field = name match {
    case "date" | "uploaded" => SingleField("uploadTime")
    case fieldName           => SingleField(fieldName)
  }

  def AllowedDateFieldName = rule { "date" | "uploaded" | "taken" }


  def MatchDateValue = rule { (String | QuotedString) ~> normaliseDateExpr _ ~> parseDateRange _ }

  def normaliseDateExpr(expr: String): String = expr.replaceAll("\\.", " ")

  val todayParser = {
    val today = DateTime.now.withTimeAtStartOfDay
    DateAliasParser("today", today, today.plusDays(1).minusMillis(1))
  }
  val yesterdayParser = {
    val today = DateTime.now.withTimeAtStartOfDay
    DateAliasParser("today", today.minusDays(1), today.minusMillis(1))
  }
  val humanDateParser  = DateRangeFormatParser("dd MMMMM YYYY", _.plusDays(1))
  val isoDateParser    = DateRangeFormatParser("YYYY-MM-dd", _.plusDays(1))
  val humanMonthParser = DateRangeFormatParser("MMMMM YYYY", _.plusMonths(1))
  val yearParser       = DateRangeFormatParser("YYYY", _.plusYears(1))
  val dateRangeParsers: List[DateRangeParser] = List(
    todayParser,
    yesterdayParser,
    humanDateParser,
    isoDateParser,
    humanMonthParser,
    yearParser
  )

  def parseDateRange(expr: String): DateRange = {
    val parsedRange = dateRangeParsers.foldLeft[Option[DateRange]](None) { case (res, parser) =>
      res orElse parser.parse(expr)
    }
    // FIXME: how to backtrack if no match? or just generate "something"?
    parsedRange.getOrElse(throw new Error("avoid match?"))
  }


  // Quoted strings
  def SingleQuote = "'"
  def DoubleQuote = "\""
  def QuotedString = rule { SingleQuote ~ capture(NotSingleQuote) ~ SingleQuote |
                            DoubleQuote ~ capture(NotDoubleQuote) ~ DoubleQuote }
  // TODO: unless escaped?
  def NotSingleQuote = rule { oneOrMore(noneOf(SingleQuote)) }
  def NotDoubleQuote = rule { oneOrMore(noneOf(DoubleQuote)) }

  def Whitespace = rule { oneOrMore(' ') }
  // any character except quotes
  def Chars      = rule { oneOrMore(CharPredicate.Visible -- DoubleQuote -- SingleQuote) }
}

// TODO:
// - is archived, has exports, has picdarUrn

// new QuerySyntax("hello world by:me").Query.run()
// hello world
// hello -world
// hello by:foo
// "hello world" foo
// ?  -"not this"
// by:"foo bar"
// -by:foo
