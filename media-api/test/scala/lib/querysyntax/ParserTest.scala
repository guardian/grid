package lib.querysyntax

import org.scalatest.{FunSpec, Matchers}
import org.joda.time.DateTime

class ParserTest extends FunSpec with Matchers {

  describe("text") {
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
  }


  describe("date") {

    describe("exact") {

      // it("should match exact ISO datetime") {
      //   Parser.run("date:2014-01-01T01:23:45Z") should be (List(
      //     Match(SingleField("uploaded"),
      //       DateRange(
      //         new DateTime("2014-01-01T01:23:45Z"),
      //         new DateTime("2014-01-01T01:23:45Z")
      //       )
      //     ))
      //   )
      // }

      it("should match year") {
        Parser.run("date:2014") should be (List(
          Match(SingleField("uploadTime"),
            DateRange(
              new DateTime("2014-01-01T00:00:00.000Z"),
              new DateTime("2014-12-31T23:59:59.999Z")
            )
          ))
        )
      }

      it("should match month, quoted") {
        Parser.run("""date:"january 2014"""") should be (List(
          Match(SingleField("uploadTime"),
            DateRange(
              new DateTime("2014-01-01T00:00:00.000Z"),
              new DateTime("2014-01-31T23:59:59.999Z")
            )
          ))
        )
      }

      it("should match month, with dot") {
        Parser.run("date:january.2014") should be (List(
          Match(SingleField("uploadTime"),
            DateRange(
              new DateTime("2014-01-01T00:00:00.000Z"),
              new DateTime("2014-01-31T23:59:59.999Z")
            )
          ))
        )
      }

      it("should match human date, quoted") {
        Parser.run("""date:"1 january 2014"""") should be (List(
          Match(SingleField("uploadTime"),
            DateRange(
              new DateTime("2014-01-01T00:00:00.000Z"),
              new DateTime("2014-01-01T23:59:59.999Z")
            )
          ))
        )
      }

      it("should match human date, with dot") {
        Parser.run("date:1.january.2014") should be (List(
          Match(SingleField("uploadTime"),
            DateRange(
              new DateTime("2014-01-01T00:00:00.000Z"),
              new DateTime("2014-01-01T23:59:59.999Z")
            )
          ))
        )
      }

      it("should match human date, with dot and capitals") {
        Parser.run("date:1.January.2014") should be (List(
          Match(SingleField("uploadTime"),
            DateRange(
              new DateTime("2014-01-01T00:00:00.000Z"),
              new DateTime("2014-01-01T23:59:59.999Z")
            )
          ))
        )
      }

      it("should match date") {
        Parser.run("date:2014-01-01") should be (List(
          Match(SingleField("uploadTime"),
            DateRange(
              new DateTime("2014-01-01T00:00:00.000Z"),
              new DateTime("2014-01-01T23:59:59.999Z")
            )
          ))
        )
      }

      // TODO: date:"1st january 2014"

    }


    describe("relative") {
      it("should match today") {
        Parser.run("date:today") should be (List(
          Match(SingleField("uploadTime"),
            DateRange(
              DateTime.now.withTimeAtStartOfDay,
              DateTime.now.plusDays(1).withTimeAtStartOfDay.minusMillis(1)
            )
          ))
        )
      }

      it("should match yesterday") {
        Parser.run("date:yesterday") should be (List(
          Match(SingleField("uploadTime"),
            DateRange(
              DateTime.now.minusDays(1).withTimeAtStartOfDay,
              DateTime.now.withTimeAtStartOfDay.minusMillis(1)
            )
          ))
        )
      }

      // TODO: date:"last week"
      // TODO: date:last.week
      // TODO: date:last.three.hours
      // TODO: date:two.days.ago (?)
      // TODO: date:2.days.ago (?)

      // TODO: date:2.january (this year)
    }


    describe("range") {

    //   it("should match date range with --") {
    //     Parser.run("date:2012--2014") should be (List(
    //       Match(SingleField("uploadTime"),
    //         DateRange(
    //           new DateTime("2012-01-01T00:00:00.000Z"),
    //           new DateTime("2014-12-31T23:59:59.999Z")
    //         )
    //       ))
    //     )
    //   }

    //   it("should match date range with 'to'") {
    //     Parser.run("date:2012.to.2014") should be (List(
    //       Match(SingleField("uploadTime"),
    //         DateRange(
    //           new DateTime("2012-01-01T00:00:00.000Z"),
    //           new DateTime("2014-12-31T23:59:59.999Z")
    //         )
    //       ))
    //     )
    //   }

      // TODO: date:12:13 to 12:18 (today)
      // TODO: date:before.1.january.2012
      // TODO: date:after.1.january.2012
      // TODO: date:<1.january.2012
      // TODO: date:>1.january.2012

    }



    describe("shortcut and facets") {

      it("should match '@' shortcut") {
        Parser.run("@2014-01-01") should be (List(
          Match(SingleField("uploadTime"),
            DateRange(
              new DateTime("2014-01-01T00:00:00.000Z"),
              new DateTime("2014-01-01T23:59:59.999Z")
            )
          ))
        )
      }

      it("should match uploaded facet term") {
        Parser.run("uploaded:2014-01-01") should be (List(
          Match(SingleField("uploadTime"),
            DateRange(
              new DateTime("2014-01-01T00:00:00.000Z"),
              new DateTime("2014-01-01T23:59:59.999Z")
            )
          ))
        )
      }

      it("should match taken facet term") {
        Parser.run("taken:2014-01-01") should be (List(
          Match(SingleField("taken"),
            DateRange(
              new DateTime("2014-01-01T00:00:00.000Z"),
              new DateTime("2014-01-01T23:59:59.999Z")
            )
          ))
        )
      }

    }

    describe("error") {

      // FIXME: make this pass
      it("should treat ignore an invalid date argument") {
        // Parser.run("date:NAZGUL") should be (List(
        // ))
      }

    }
  }


  describe("negation") {

    it("should match negated single terms") {
      Parser.run("-cats") should be (List(Negation(Match(AnyField, Words("cats")))))
    }

    it("should match negated quoted terms") {
      Parser.run("""-"cats dogs"""") should be (List(Negation(Match(AnyField, Phrase("cats dogs")))))
    }

  }


  describe("aliases") {

    it("should match aliases to a single canonical field") {
      Parser.run("by:cats") should be (List(Match(SingleField("byline"), Words("cats"))))
    }

    it("should match aliases to multiple fields") {
      Parser.run("in:berlin") should be (List(Match(MultipleField(List("location", "city", "state", "country")), Words("berlin"))))
    }

    it("should match #terms as labels") {
      Parser.run("#cats") should be (List(Match(SingleField("labels"), Words("cats"))))
    }

  }


  describe("combination") {

    it("should combination of terms") {
      Parser.run("""-credit:"cats dogs" unicorns""") should be (List(Negation(Match(SingleField("credit"), Phrase("cats dogs"))), Match(AnyField, Words("unicorns"))))
    }

  }
}
