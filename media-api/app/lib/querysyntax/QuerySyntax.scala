package lib.querysyntax

import com.gu.mediaservice.lib.ImageFields
import com.gu.mediaservice.model.{Jpeg, MimeType, Png, Tiff}
import org.joda.time.DateTime
import org.parboiled2._

case class InvalidQuery(message: String) extends Exception(message)

class QuerySyntax(val input: ParserInput) extends Parser with ImageFields {

  val beginningOfTime = new DateTime(0L)

  def today = DateTime.now.withTimeAtStartOfDay
  def tomorrow = today.plusDays(1)
  def yesterday = today.minusDays(1)

  def Query = rule { Expression ~ EOI }

  def Expression = rule { zeroOrMore(Term) separatedBy Whitespace }

  def Term = rule { NestedFilter | NegatedFilter | Filter }

  def NegatedFilter = rule { '-' ~ Filter ~> Negation }

  def NestedFilter = rule {
    NestedMatch ~> Nested |
    NestedDateMatch
  }

  def Filter = rule {
    HasMatch ~> Match |
    IsMatch ~> Match |
    DateConstraintMatch |
    DateRangeMatch ~> Match | AtMatch |
    FileTypeMatch ~> Match |
    ScopedMatch ~> Match | HashMatch | CollectionRule |
    AnyMatch
  }

  def HasMatch = rule { HasMatchField ~ ':' ~ HasMatchValue }
  def HasMatchField = rule { capture(HasFieldName) ~> (_ => HasField) }
  def HasFieldName = rule { "has" }
  def HasMatchValue = rule { String ~> HasValue }

  def IsMatch = rule { IsMatchField ~ ':' ~ IsMatchValue }
  def IsMatchField = rule { capture(IsFieldName) ~> (_ => IsField) }
  def IsFieldName = rule { "is" }
  def IsMatchValue = rule { String ~> IsValue }

  def NestedMatch = rule { ParentField ~ "@" ~ NestedField ~ ':' ~ ExactMatchValue }
  def NestedDateMatch = rule { ParentField ~ "@" ~ DateConstraintMatch ~> (
    (parentField: Field, dateMatch: Match) => {
      Nested(parentField, dateMatch.field, dateMatch.value)
    }
  )}

  def DateConstraintMatch = rule { DateConstraint ~ DateMatch ~> (
    (constraint: String, dateMatch: Match) => {
      val dateRange  = dateMatch.value match {
        case Date(d) => constraint match {
          case ">" => DateRange(d, tomorrow)
          case "<" => DateRange(beginningOfTime, d)
        }
        case _ => throw new InvalidQuery("No date for date constraint!")
      }

      Match(dateMatch.field, dateRange)
    }
  )}

  def DateConstraint = rule { capture(AllowedDateConstraints) }
  def AllowedDateConstraints = rule {
    "<" | ">"
  }

  def ScopedMatch = rule { MatchField ~ ':' ~ MatchValue }

  def HashMatch = rule { '#' ~ MatchValue ~> (
    label => Match(
      SingleField(getFieldPath("labels")),
      label
    )
  )}

  def CollectionRule = rule { '~' ~ ExactMatchValue ~> (
    collection => Match(
      HierarchyField,
      Phrase(collection.string.toLowerCase)
    )
  )}

  def ParentField = rule { capture(AllowedParentFieldName)  ~> resolveNamedField _ }
  def NestedField = rule { capture(AllowedNestedFieldName) ~> resolveNamedField _ }
  def MatchField = rule { (capture(AllowedFieldName) | QuotedString | StringWithoutColon) ~> resolveNamedField _ }

  def AllowedParentFieldName = rule { "usages" }
  def AllowedNestedFieldName = rule {
    "status" | "platform" | "section" | "publication" | "orderedBy" | "reference"
  }

  // BEWARE! Ordering of this list matters.
  // If a word is a prefix of another, it must come last.
  // e.g foo must come _after_ food.
  // This might be an issue with the parboiled library.
  // TODO: fix this!
  def AllowedFieldName = rule {
    "illustrator" |
    "uploader" |
    "location" | "city" | "state" | "country" | "in" |
    "bylineTitle" |
    "byline" | "by" | "photographer" |
    "description" |
    "credit" |
    "copyright" |
    "source" |
    "category" |
    "subject" |
    "suppliersReference" |
    "supplier" |
    "specialInstructions" |
    "title" |
    "collection" |
    "keyword" |
    "label" |
    "croppedBy" |
    "filename" |
    "photoshoot" |
    "leasedBy" |
    "person"
  }

  def resolveNamedField(name: String): Field = (name match {
    case "illustrator"         => "credit"
    case "uploader"            => "uploadedBy"
    case "label"               => "labels"
    case "collection"          => "suppliersCollection"
    case "subject"             => "subjects"
    case "location"            => "subLocation"
    case "by" | "photographer" => "byline"
    case "keyword"             => "keywords"
    case "person"              => "peopleInImage"
    case fieldName             => fieldName
  }) match {
    case "publication" => MultipleField(List("publicationName", "publicationCode"))
    case "section" => MultipleField(List("sectionId","sectionCode"))
    case "reference" => MultipleField(List("references.uri", "references.name").map(usagesField))
    case "in" => MultipleField(List("subLocation", "city", "state", "country").map(getFieldPath))
    case field => SingleField(getFieldPath(field))
  }

  def AnyMatch = rule { MatchValue ~> (v => Match(AnyField, v)) }

  def ExactMatchValue = rule { QuotedString ~> Phrase | String ~> Phrase }

  // Note: order matters, check for quoted string first
  def MatchValue = rule { QuotedString ~> Phrase | String ~> Words }

  def String = rule { capture(Chars) }

  def StringWithoutColon = rule { capture(NotColon) }

  def DateMatch = rule {
    MatchDateField ~ ':' ~ MatchDateValue ~> ((field, date) => Match(field, Date(date)))
  }

  def DateRangeMatch = rule {
    MatchDateField ~ ':' ~ MatchDateRangeValue
  }

  def FileTypeMatch = rule {
    MatchMimeTypeField ~ ':' ~ MatchMimeTypeValue
  }

  def AtMatch = rule { '@' ~ MatchDateRangeValue ~> (range => Match(SingleField(getFieldPath("uploadTime")), range)) }

  def MatchDateField = rule { capture(AllowedDateFieldName) ~> resolveDateField _ }

  def MatchMimeTypeField = rule {
    capture("fileType") ~> resolveMimeTypeField _
  }

  def resolveMimeTypeField(name: String): Field = name match {
    case "fileType" => SingleField(getFieldPath("mimeType"))
  }

  def resolveDateField(name: String): Field = name match {
    case "date" | "uploaded" => SingleField("uploadTime")
    case "taken"             => SingleField("dateTaken")
    case "added"             => SingleField("dateAdded")
  }

  def AllowedDateFieldName = rule { "date" | "uploaded" | "taken" | "added" }

  def MatchDateValue = rule {
    (QuotedString | String) ~> normaliseDateExpr _ ~> parseDate _ ~> (d => {
      test(d.isDefined) ~ push(d.get)
    })
  }

  def MatchDateRangeValue = rule {
    (QuotedString | String) ~> normaliseDateExpr _ ~> parseDateRange _ ~> (d => {
      test(d.isDefined) ~ push(d.get)
    })
  }

  def MatchMimeTypeValue = rule {
    capture(AllowedFileTypesValues) ~> parseMimeType _
  }

  def AllowedFileTypesValues = rule { "tiff" | "tif" | "jpg" | "jpeg" | "png" }

  def translateMimeType(expr: String): MimeType = expr match {
    case s if s.equals("tif") || s.equals("tiff") => Tiff
    case s if s.equals("jpg") || s.equals("jpeg") => Jpeg
    case s if s.equals("png") => Png
  }

  def parseMimeType(expr: String): Value = Words(translateMimeType(expr).toString)

  def normaliseDateExpr(expr: String): String = expr.replaceAll("\\.", " ")

  val todayParser      = DateAliasParser("today", today, tomorrow)
  val yesterdayParser  = DateAliasParser("yesterday", yesterday, today)

  val humanDateParser  = DateFormatParser("dd MMMMM YYYY")
  val slashDateParser  = DateFormatParser("d/M/YYYY")
  val paddedslashDateParser = DateFormatParser("dd/MM/YYYY")
  val isoDateParser    = DateFormatParser("YYYY-MM-dd")

  val humanMonthParser = DateFormatParser("MMMMM YYYY", Some(_.plusMonths(1)))
  val yearParser       = DateFormatParser("YYYY", Some(_.plusYears(1)))

  val dateParsers: List[DateParser] = List(
    todayParser,
    yesterdayParser,
    humanDateParser,
    slashDateParser,
    paddedslashDateParser,
    isoDateParser,
    humanMonthParser,
    yearParser
  )

  def parseDate(expr: String): Option[DateTime] = {
    dateParsers.foldLeft[Option[DateTime]](None) { case (res, parser) =>
      res orElse parser.parseDate(expr)
    }
  }

  def parseDateRange(expr: String): Option[DateRange] = {
    dateParsers.foldLeft[Option[DateRange]](None) { case (res, parser) =>
      res orElse parser.parseRange(expr)
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
  def NotColon = rule { oneOrMore(charsMinusColon) }

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
  val charsMinusColon = visibleChars -- ':'

}

// TODO:
// - is archived, has exports, has picdarUrn
