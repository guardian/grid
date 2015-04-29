package lib.querysyntax

import scala.util.Try

import org.joda.time.DateTime
import org.joda.time.format.{DateTimeFormatter, DateTimeFormat}


trait DateRangeParser {
  def parse(expr: String): Option[DateRange]
}

case class DateAliasParser(alias: String, startDate: DateTime, endDate: DateTime) extends DateRangeParser {
  def parse(expr: String) = if (expr == alias) {
    Some(DateRange(startDate, endDate))
  } else {
    None
  }
}

case class DateRangeFormatParser(format: String, computeEnd: DateTime => DateTime) extends DateRangeParser {
  val formatter = DateTimeFormat.forPattern(format)
  def parseDate(expr: String, format: DateTimeFormatter): Option[DateTime] = Try(DateTime.parse(expr, format)).toOption

  def parse(expr: String): Option[DateRange] = {
    // -1ms because the bounds are inclusive
    parseDate(expr, formatter).map(d => DateRange(d, computeEnd(d).minusMillis(1)))
  }

}
