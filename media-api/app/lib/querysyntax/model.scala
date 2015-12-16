package lib.querysyntax

import org.joda.time.DateTime

sealed trait Condition
final case class Negation(m: Match) extends Condition
final case class Match(field: Field, value: Value) extends Condition

sealed trait Field
case object AnyField extends Field
final case class HierarchyField(name: String, value: String) extends Field
final case class SingleField(name: String) extends Field
final case class MultipleField(names: List[String]) extends Field

sealed trait Value
final case class Words(string: String) extends Value
final case class Phrase(string: String) extends Value
final case class DateRange(start: DateTime, end: DateTime) extends Value
