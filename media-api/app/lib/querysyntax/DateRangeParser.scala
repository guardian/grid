package lib.querysyntax

import org.joda.time.DateTime
import org.joda.time.format.DateTimeFormat

import scala.util.Try

trait DateParser {
  val format: String
  lazy val formatter = DateTimeFormat.forPattern(format)

  def parseRange(expr: String): Option[DateRange]
  def parseDate(expr: String): Option[DateTime] = Try(DateTime.parse(expr, formatter)).toOption
}

case class DateAliasParser(alias: String, start: DateTime, end: DateTime) extends DateParser {
  val format = ""

  def parseRange(expr: String) =
    if (expr == alias) Some(DateRange(start, end.minusMillis(1))) else None
}

case class DateFormatParser(format: String, calculateEnd: Option[(DateTime) => DateTime] = None) extends DateParser {

  def parseRange(expr: String): Option[DateRange] =
    parseDate(expr).map(start => {
      val sameDay = (start: DateTime) => start.plusDays(1)
      val end   = calculateEnd.getOrElse(sameDay)(start).minusMillis(1)

      DateRange(start, end)
    })
}
