package lib.querysyntax

sealed trait Condition
case class Negation(m: Match) extends Condition
case class Match(field: Field, value: String) extends Condition

sealed trait Field
case object AnyField extends Field
case class SingleField(name: String) extends Field
case class MultipleField(names: List[String]) extends Field
