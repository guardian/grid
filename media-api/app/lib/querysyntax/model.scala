package lib.querysyntax

import org.joda.time.DateTime

sealed trait Condition
final case class Negation(m: Match) extends Condition
final case class Match(field: Field, value: Value) extends Condition
final case class Nested(parentField: Field, field: Field, value: Value) extends Condition

sealed trait Field
final case object AnyField extends Field
final case object HierarchyField extends Field
final case class SingleField(name: String) extends Field
final case class MultipleField(names: List[String]) extends Field
final case object HasField extends Field
final case object IsField extends Field

sealed trait Value
final case class Words(string: String) extends Value
final case class Phrase(string: String) extends Value
final case class Date(date: DateTime) extends Value
final case class DateRange(startDate: DateTime, endDate: DateTime) extends Value
final case class HasValue(string: String) extends Value
final case class IsValue(string: String) extends Value
