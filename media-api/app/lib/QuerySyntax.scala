package lib

import org.parboiled2._

class QuerySyntax(val input: ParserInput) extends Parser {
  def Query = rule { Expression ~ EOI }

  def Expression = rule { oneOrMore(TermGroup) separatedBy Whitespace }

  // TODO: OR syntax and tree
  // TODO: paren syntax and tree - allow multi terms inside
  def TermGroup = rule { Term }
//  def TermGroup = rule { Term | '(' ~ oneOrMore(Expression) ~ ')' }

  def Term = rule { NegatedFilter | Filter }

  def NegatedFilter = rule { '-' ~ Filter ~> Negation }


  def Filter = rule { ScopedMatch ~> Match | AnyMatch }

  def ScopedMatch: Rule2[Field, String] = rule { MatchField ~ ':' ~ MatchValue }

  def MatchField = rule { capture(AllowedFieldName) ~> NamedField }
  // TODO: more fields, incl typed (e.g. dates)
  def AllowedFieldName = rule { "photographer" | "by" }

  def AnyMatch = rule { MatchValue ~> ((v: String) => Match(AnyField, v)) }


  def MatchValue: Rule1[String] = rule { QuotedString | String }

  def String = rule { capture(Chars) }

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
  def Chars      = rule { oneOrMore(CharPredicate.Visible -- '"' -- '\'') }
}

case class Negation(m: Match)
case class Match(field: Field, value: String)

sealed trait Field
case object AnyField extends Field
case class NamedField(name: String) extends Field

// new QuerySyntax("hello world by:me").Query.run()
// hello world
// hello -world
// hello by:foo
// "hello world" foo
// ?  -"not this"
// by:"foo bar"
// -by:foo

// "-x OR by:you"
// foo OR bar   -  foo | bar
// hello (world OR baz)
