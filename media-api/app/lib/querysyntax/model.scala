package lib.querysyntax

import org.joda.time.DateTime

sealed trait Condition
case class Negation(m: Match) extends Condition
case class Match(field: Field, value: Value) extends Condition

sealed trait Field
case object AnyField extends Field
case class SingleField(name: String) extends Field
case class MultipleField(names: List[String]) extends Field

sealed trait Value
case class Words(string: String) extends Value
case class Phrase(string: String) extends Value
case class DateRange(start: DateTime, end: DateTime) extends Value
