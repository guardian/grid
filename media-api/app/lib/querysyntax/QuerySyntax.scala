package lib.querysyntax

import org.joda.time.DateTime
import org.parboiled2._

import com.gu.mediaservice.lib.elasticsearch.ImageFields

class QuerySyntax(val input: ParserInput) extends Parser with ImageFields {
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
  def HashMatch = rule { '#' ~ MatchValue ~> (label => Match(SingleField(getFieldPath("labels")), label)) }

  def MatchField = rule { capture(AllowedFieldName) ~> resolveNamedField _ }

  def AllowedFieldName = rule {
    "uploader" |
    "location" | "city" | "state" | "country" | "in" |
    "byline" | "by" | "photographer" |
    "description" |
    "credit" |
    "copyright" |
    "source" |
    "category" |
    "supplier" |
    "collection" |
    "keyword" |
    "label"
  }

  def resolveNamedField(name: String): Field = (name match {
    case "uploader"            => "uploadedBy"
    case "label"               => "labels"
    case "collection"          => "suppliersCollection"
    case "location"            => "subLocation"
    case "by" | "photographer" => "byline"
    case "keyword"             => "keywords"
    case fieldName             => fieldName
  }) match {
    case "in" => MultipleField(List("location", "city", "state", "country").map(getFieldPath))
    case field => SingleField(getFieldPath(field))
  }


  def AnyMatch = rule { MatchValue ~> (v => Match(AnyField, v)) }


  // Note: order matters, check for quoted string first
  def MatchValue = rule { QuotedString ~> Phrase | String ~> Words }

  def String = rule { capture(Chars) }


  // TODO: also comparisons
  def DateMatch = rule { MatchDateField ~ ':' ~ MatchDateValue }

  def AtMatch = rule { '@' ~ MatchDateValue ~> (range => Match(SingleField(getFieldPath("uploadTime")), range)) }

  def MatchDateField = rule { capture(AllowedDateFieldName) ~> resolveDateField _ }

  def resolveDateField(name: String): Field = name match {
    case "date" | "uploaded" => SingleField("uploadTime")
    case "taken"             => SingleField("dateTaken")
  }

  def AllowedDateFieldName = rule { "date" | "uploaded" | "taken" }


  def MatchDateValue = rule {
    // Note: order matters, check for quoted string first
    // TODO: needed to ignore invalid dates, but code could be cleaner
    (QuotedString | String) ~> normaliseDateExpr _ ~> parseDateRange _ ~> (d => test(d.isDefined) ~ push(d.get))
  }

  def normaliseDateExpr(expr: String): String = expr.replaceAll("\\.", " ")

  val todayParser = {
    val today = DateTime.now.withTimeAtStartOfDay
    DateAliasParser("today", today, today.plusDays(1).minusMillis(1))
  }
  val yesterdayParser = {
    val today = DateTime.now.withTimeAtStartOfDay
    DateAliasParser("yesterday", today.minusDays(1), today.minusMillis(1))
  }
  val humanDateParser  = DateRangeFormatParser("dd MMMMM YYYY", _.plusDays(1))
  val slashDateParser  = DateRangeFormatParser("d/M/YYYY", _.plusDays(1))
  val paddedslashDateParser = DateRangeFormatParser("dd/MM/YYYY", _.plusDays(1))
  val isoDateParser    = DateRangeFormatParser("YYYY-MM-dd", _.plusDays(1))
  val humanMonthParser = DateRangeFormatParser("MMMMM YYYY", _.plusMonths(1))
  val yearParser       = DateRangeFormatParser("YYYY", _.plusYears(1))
  val dateRangeParsers: List[DateRangeParser] = List(
    todayParser,
    yesterdayParser,
    humanDateParser,
    slashDateParser,
    paddedslashDateParser,
    isoDateParser,
    humanMonthParser,
    yearParser
  )

  def parseDateRange(expr: String): Option[DateRange] = {
    dateRangeParsers.foldLeft[Option[DateRange]](None) { case (res, parser) =>
      res orElse parser.parse(expr)
    }
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
  def Chars = rule { oneOrMore(visibleChars) }


  // Note: this is a somewhat arbitrarily list of common Unicode ranges that we
  // expect people to want to use (e.g. Latin1 accented characters, curly quotes, etc).
  // This is likely not exhaustive and will need reviewing in the future.
  val latin1SupplementSubset = CharPredicate('\u00a1' to '\u00ff')
  val latin1ExtendedA = CharPredicate('\u0100' to '\u017f')
  val latin1ExtendedB = CharPredicate('\u0180' to '\u024f')
  val generalPunctuation = CharPredicate('\u2010' to '\u203d')
  val latin1ExtendedAdditional = CharPredicate('\u1e00' to '\u1eff')
  val extraVisibleCharacters = latin1SupplementSubset ++ latin1ExtendedA ++ latin1ExtendedB ++ generalPunctuation

  val visibleChars = CharPredicate.Visible ++ extraVisibleCharacters

}

// TODO:
// - is archived, has exports, has picdarUrn
