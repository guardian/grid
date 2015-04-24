package lib.querysyntax

import org.scalatest.{FunSpec, Matchers}

class ParserTest extends FunSpec with Matchers {

  it("should match single terms") {
    Parser.run("cats") should be (List(Match(AnyField, Words("cats"))))
  }

  it("should ignore surrounding whitespace") {
    Parser.run(" cats ") should be (List(Match(AnyField, Words("cats"))))
  }

  it("should match multiple terms") {
    Parser.run("cats dogs") should be (List(Match(AnyField, Words("cats")), Match(AnyField, Words("dogs"))))
  }

  it("should match quoted terms") {
    Parser.run(""""cats dogs"""") should be (List(Match(AnyField, Phrase("cats dogs"))))
  }

  it("should match faceted terms") {
    Parser.run("credit:cats") should be (List(Match(SingleField("credit"), Words("cats"))))
  }

  it("should match negated single terms") {
    Parser.run("-cats") should be (List(Negation(Match(AnyField, Words("cats")))))
  }

  it("should match negated quoted terms") {
    Parser.run("""-"cats dogs"""") should be (List(Negation(Match(AnyField, Phrase("cats dogs")))))
  }

  it("should match aliases to a single canonical field") {
    Parser.run("by:cats") should be (List(Match(SingleField("byline"), Words("cats"))))
  }

  it("should match aliases to multiple fields") {
    Parser.run("in:berlin") should be (List(Match(MultipleField(List("location", "city", "state", "country")), Words("berlin"))))
  }

  it("should match #terms as labels") {
    Parser.run("#cats") should be (List(Match(SingleField("labels"), Words("cats"))))
  }

  it("should combination of terms") {
    Parser.run("""-credit:"cats dogs" unicorns""") should be (List(Negation(Match(SingleField("credit"), Phrase("cats dogs"))), Match(AnyField, Words("unicorns"))))
  }
}
