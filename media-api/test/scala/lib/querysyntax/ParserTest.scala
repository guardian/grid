package lib.querysyntax

import com.gu.mediaservice.lib.ImageFields
import org.scalatest.{BeforeAndAfter, FunSpec, Matchers}
import org.joda.time.DateTime
import org.joda.time.DateTimeUtils

class ParserTest extends FunSpec with Matchers with BeforeAndAfter with ImageFields {
  val creditField     = SingleField(getFieldPath("credit"))
  val bylineField     = SingleField(getFieldPath("byline"))
  val labelsField     = SingleField(getFieldPath("labels"))
  val uploadTimeField = SingleField(getFieldPath("uploadTime"))

  describe("text") {
    it("should match single terms") {
      Parser.run("cats") should be (List(Match(AnyField, Words("cats")), Negation(Match(IsField,IsValue("deleted")))))
    }

    it("should match single terms with accents") {
      Parser.run("séb") should be (List(Match(AnyField,Words("séb")), Negation(Match(IsField,IsValue("deleted")))))
    }
    it("should match single terms with curly apostrophe") {
      Parser.run("l’apostrophe") should be (List(Match(AnyField, Words("l’apostrophe")), Negation(Match(IsField,IsValue("deleted")))))
    }

    it("should ignore surrounding whitespace") {
      Parser.run(" cats ") should be (List(Match(AnyField, Words("cats")), Negation(Match(IsField,IsValue("deleted")))))
    }

    it("should match multiple terms") {
      Parser.run("cats dogs") should be (List(Match(AnyField, Words("cats dogs")), Negation(Match(IsField,IsValue("deleted")))))
    }

    it("should match multiple terms separated by multiple whitespace") {
      Parser.run("cats  dogs") should be (List(Match(AnyField, Words("cats dogs")), Negation(Match(IsField,IsValue("deleted")))))
    }

    it("should match multiple terms including 'in'") {
      Parser.run("cats in dogs") should be (List(Match(AnyField, Words("cats in dogs")), Negation(Match(IsField,IsValue("deleted")))))
    }

    it("should match multiple terms including 'by'") {
      Parser.run("cats by dogs") should be (List(Match(AnyField, Words("cats by dogs")), Negation(Match(IsField,IsValue("deleted")))))
    }

    it("should match multiple terms including apostrophes") {
      Parser.run("it's a cat") should be (List(Match(AnyField, Words("it's a cat")), Negation(Match(IsField,IsValue("deleted")))))
    }

    it("should match multiple terms including commas") {
      Parser.run("cats, dogs") should be (List(Match(AnyField, Words("cats, dogs")), Negation(Match(IsField,IsValue("deleted")))))
    }

    it("should match multiple terms including single double quotes") {
      Parser.run("5\" cats") should be (List(Match(AnyField, Words("5\" cats")), Negation(Match(IsField,IsValue("deleted")))))
    }

    // it("should match multiple terms including '#' character") {
    //   // FIXME: gets caught as label; exclude numeric?
    //   Parser.run("the #1 cat") should be (List(Match(AnyField, Words("the")), Match(AnyField, Words("#1")), Match(AnyField, Words("cat"))))
    // }

    it("should match a quoted phrase") {
      Parser.run(""""cats dogs"""") should be (List(Match(AnyField, Phrase("cats dogs")), Negation(Match(IsField,IsValue("deleted")))))
    }

    it("should match faceted terms") {
      Parser.run("credit:cats") should be (List(Match(creditField, Words("cats")), Negation(Match(IsField,IsValue("deleted")))))
    }

    it("should match multiple faceted terms on the same facet") {
      Parser.run("label:cats label:dogs") should be (List(
        Match(labelsField, Words("cats")),
        Match(labelsField, Words("dogs")),
        Negation(Match(IsField,IsValue("deleted")))
      ))
    }

    it("should match multiple faceted terms on different facets") {
      Parser.run("credit:cats label:dogs") should be (List(
        Match(creditField, Words("cats")),
        Match(labelsField, Words("dogs")),
        Negation(Match(IsField,IsValue("deleted")))
      ))
    }
  }


  describe("date") {

    describe("exact") {

      it("should match year") {
        Parser.run("date:2014") should be (List(
          Match(uploadTimeField,
            DateRange(
              new DateTime("2014-01-01T00:00:00.000Z"),
              new DateTime("2014-12-31T23:59:59.999Z")
            )
          ),
          Negation(Match(IsField,IsValue("deleted"))))
        )
      }

      it("should match month, quoted") {
        Parser.run("""date:"january 2014"""") should be (List(
          Match(uploadTimeField,
            DateRange(
              new DateTime("2014-01-01T00:00:00.000Z"),
              new DateTime("2014-01-31T23:59:59.999Z")
            )
          ),
          Negation(Match(IsField,IsValue("deleted"))))
        )
      }

      it("should match month, with dot") {
        Parser.run("date:january.2014") should be (List(
          Match(uploadTimeField,
            DateRange(
              new DateTime("2014-01-01T00:00:00.000Z"),
              new DateTime("2014-01-31T23:59:59.999Z")
            )
          ),
          Negation(Match(IsField,IsValue("deleted"))))
        )
      }

      it("should match human date, quoted") {
        Parser.run("""date:"1 january 2014"""") should be (List(
          Match(uploadTimeField,
            DateRange(
              new DateTime("2014-01-01T00:00:00.000Z"),
              new DateTime("2014-01-01T23:59:59.999Z")
            )
          ),
          Negation(Match(IsField,IsValue("deleted"))))
        )
      }

      it("should match human date, with dot") {
        Parser.run("date:1.january.2014") should be (List(
          Match(uploadTimeField,
            DateRange(
              new DateTime("2014-01-01T00:00:00.000Z"),
              new DateTime("2014-01-01T23:59:59.999Z")
            )
          ),
          Negation(Match(IsField,IsValue("deleted"))))
        )
      }

      it("should match human date, with dot and capitals") {
        Parser.run("date:1.January.2014") should be (List(
          Match(uploadTimeField,
            DateRange(
              new DateTime("2014-01-01T00:00:00.000Z"),
              new DateTime("2014-01-01T23:59:59.999Z")
            )
          ),
          Negation(Match(IsField,IsValue("deleted"))))
        )
      }

      it("should match date with slashes") {
        Parser.run("date:1/1/2014") should be (List(
          Match(uploadTimeField,
            DateRange(
              new DateTime("2014-01-01T00:00:00.000Z"),
              new DateTime("2014-01-01T23:59:59.999Z")
            )
          ),
          Negation(Match(IsField,IsValue("deleted"))))
        )
      }

      it("should match date with slashes and zero-padding") {
        Parser.run("date:01/01/2014") should be (List(
          Match(uploadTimeField,
            DateRange(
              new DateTime("2014-01-01T00:00:00.000Z"),
              new DateTime("2014-01-01T23:59:59.999Z")
            )
          ),
          Negation(Match(IsField,IsValue("deleted"))))
        )
      }

      it("should match date") {
        Parser.run("date:2014-01-01") should be (List(
          Match(uploadTimeField,
            DateRange(
              new DateTime("2014-01-01T00:00:00.000Z"),
              new DateTime("2014-01-01T23:59:59.999Z")
            )
          ),
          Negation(Match(IsField,IsValue("deleted"))))
        )
      }

      // TODO: date:"1st january 2014"

    }


    describe("relative") {
      // Mock current time so we can assert based on the fake "now"
      before {
        val earlyMillenium = new DateTime("2000-01-02T03:04:05Z")
        DateTimeUtils.setCurrentMillisFixed(earlyMillenium.getMillis)
      }

      after {
        DateTimeUtils.setCurrentMillisSystem()
      }

      it("should match today") {
        Parser.run("date:today") should be (List(
          Match(uploadTimeField,
            DateRange(
              new DateTime("2000-01-02T00:00:00.000Z"),
              new DateTime("2000-01-02T23:59:59.999Z")
            )
          ),
          Negation(Match(IsField,IsValue("deleted"))))
        )
      }

      it("should match yesterday") {
        Parser.run("date:yesterday") should be (List(
          Match(uploadTimeField,
            DateRange(
              new DateTime("2000-01-01T00:00:00.000Z"),
              new DateTime("2000-01-01T23:59:59.999Z")
            )
          ),
          Negation(Match(IsField,IsValue("deleted"))))
        )
      }

      // TODO: date:"last week"
      // TODO: date:last.week
      // TODO: date:last.three.hours
      // TODO: date:two.days.ago (?)
      // TODO: date:2.days.ago (?)

      // TODO: date:2.january (this year)
    }

    describe("nested usage") {
      it("should match nested usage status query") {
        Parser.run("usages@status:pending") should be (List(
          Nested(
            SingleField("usages"),
            SingleField("usages.status"),
            Phrase("pending")
          ),
          Negation(Match(IsField,IsValue("deleted"))))
        )
      }

      it("should match nested usage reference query") {
        Parser.run("usages@reference:foo") should be (List(
          Nested(
            SingleField("usages"),
            MultipleField(List(
              "usages.references.uri",
              "usages.references.name"
            )),
            Phrase("foo")
          ),
          Negation(Match(IsField,IsValue("deleted"))))
        )
      }

      it("should match nested usage reference query with url supplied") {
        Parser.run("usages@reference:https://generic.cms/1234") should be (List(
          Nested(
            SingleField("usages"),
            MultipleField(List(
              "usages.references.uri",
              "usages.references.name"
            )),
            Phrase("https://generic.cms/1234")
          ),
          Negation(Match(IsField,IsValue("deleted"))))
        )
      }
    }

    describe("date constraint") {

      it("should match date constraint") {
        Parser.run("<date:2012-01-01") should be (List(
          Match(SingleField("uploadTime"),
            DateRange(
              new DateTime("1970-01-01T01:00:00.000+01:00"),
              new DateTime("2012-01-01T00:00:00.000Z")
            )
          ),
          Negation(Match(IsField,IsValue("deleted"))))
        )
      }

      describe("nested") {

        it("should match date constraint with parent field") {
          Parser.run("usages@<added:2012-01-01") should be (List(
            Nested(SingleField("usages"), SingleField("dateAdded"),
              DateRange(
                new DateTime("1970-01-01T01:00:00.000+01:00"),
                new DateTime("2012-01-01T00:00:00.000Z")
              )
            ),
            Negation(Match(IsField,IsValue("deleted"))))
          )
        }

      }

    }

    describe("shortcut and facets") {

      it("should match '@' shortcut") {
        Parser.run("@2014-01-01") should be (List(
          Match(uploadTimeField,
            DateRange(
              new DateTime("2014-01-01T00:00:00.000Z"),
              new DateTime("2014-01-01T23:59:59.999Z")
            )
          ),
          Negation(Match(IsField,IsValue("deleted"))))
        )
      }

      it("should match uploaded facet term") {
        Parser.run("uploaded:2014-01-01") should be (List(
          Match(uploadTimeField,
            DateRange(
              new DateTime("2014-01-01T00:00:00.000Z"),
              new DateTime("2014-01-01T23:59:59.999Z")
            )
          ),
          Negation(Match(IsField,IsValue("deleted"))))
        )
      }

      it("should match taken facet term") {
        Parser.run("taken:2014-01-01") should be (List(
          Match(SingleField("dateTaken"),
            DateRange(
              new DateTime("2014-01-01T00:00:00.000Z"),
              new DateTime("2014-01-01T23:59:59.999Z")
            )
          ),
          Negation(Match(IsField,IsValue("deleted"))))
        )
      }

    }


    describe("error") {

      // TODO: or better, return parse error to client?
      it("should ignore an invalid date argument") {
        Parser.run("date:NAZGUL") should be (List(
          Match(SingleField("date"), Words("NAZGUL")),
          Negation(Match(IsField,IsValue("deleted")))
        ))
      }

    }
  }


  describe("negation") {

    it("should match negated single terms") {
      Parser.run("-cats") should be (List(Negation(Match(AnyField, Words("cats"))), Negation(Match(IsField,IsValue("deleted")))))
    }

    it("should match negated quoted terms") {
      Parser.run("""-"cats dogs"""") should be (List(Negation(Match(AnyField, Phrase("cats dogs"))), Negation(Match(IsField,IsValue("deleted")))))
    }

  }


  describe("aliases") {

    it("should match aliases to a single canonical field") {
      Parser.run("by:cats") should be (List(Match(bylineField, Words("cats")), Negation(Match(IsField,IsValue("deleted")))))
    }

    it("should match aliases to multiple fields") {
      Parser.run("in:berlin") should be (List(Match(MultipleField(List("subLocation", "city", "state", "country").map(getFieldPath)),
        Words("berlin")), Negation(Match(IsField,IsValue("deleted")))))
    }

    it("should match #terms as labels") {
      Parser.run("#cats") should be (List(Match(labelsField, Words("cats")), Negation(Match(IsField,IsValue("deleted")))))
    }

  }


  describe("combination") {

    it("should combination of terms (negated faceted word, word)") {
      Parser.run("""-credit:cats dogs""") should be (List(
        Negation(Match(creditField, Words("cats"))),
        Match(AnyField, Words("dogs")),
        Negation(Match(IsField,IsValue("deleted")))
      ))
    }

    it("should combination of terms (negated faceted phrase, word)") {
      Parser.run("""-credit:"cats dogs" unicorns""") should be (List(
        Negation(Match(creditField, Phrase("cats dogs"))),
        Match(AnyField, Words("unicorns")),
        Negation(Match(IsField,IsValue("deleted")))
      ))
    }

    it("should combination of terms (multiple words, label)") {
      Parser.run("""cats dogs #unicorns""") should be (List(
        Match(AnyField, Words("cats dogs")),
        Match(labelsField, Words("unicorns")),
        Negation(Match(IsField,IsValue("deleted")))
      ))
    }

    it("should combination of terms (multiple words, label interleaved)") {
      Parser.run("""cats #unicorns dogs""") should be (List(
        Match(AnyField, Words("cats")),
        Match(labelsField, Words("unicorns")),
        Match(AnyField, Words("dogs")),
        Negation(Match(IsField,IsValue("deleted")))
      ))
    }

    it("should combination of terms (negated word, word)") {
      Parser.run("""-cats dogs""") should be (List(
        Negation(Match(AnyField, Words("cats"))),
        Match(AnyField, Words("dogs")),
        Negation(Match(IsField,IsValue("deleted")))
      ))
    }

  }

  describe("has filter") {
    it("should find images with crops") {
      Parser.run("has:crops") should be (List(
        Match(HasField, HasValue("crops")),
        Negation(Match(IsField,IsValue("deleted")))
      ))
    }

    it("should match multiple terms and the has query") {
      Parser.run("cats dogs has:rightsSyndication") should be (List(
        Match(AnyField, Words("cats dogs")),
        Match(HasField, HasValue("rightsSyndication")),
        Negation(Match(IsField,IsValue("deleted")))
      ))
    }

    it("should match negated has queries") {
      Parser.run("-has:foo") should be (List(
        Negation(Match(HasField, HasValue("foo"))),
        Negation(Match(IsField,IsValue("deleted")))
      ))
    }

    it("should match aliases and a has query") {
      Parser.run("by:cats has:paws") should be (List(
        Match(bylineField, Words("cats")),
        Match(HasField, HasValue("paws")),
        Negation(Match(IsField,IsValue("deleted")))
      ))
    }
  }

  describe("fileType filter") {
    it("should find jpegs images") {
      Parser.run("fileType:jpeg") should be (List(
        Match(SingleField(getFieldPath("mimeType")), Words("image/jpeg")),
        Negation(Match(IsField,IsValue("deleted")))
      ))
    }

    it("should find png images") {
      Parser.run("fileType:png") should be (List(
        Match(SingleField(getFieldPath("mimeType")), Words("image/png")),
        Negation(Match(IsField,IsValue("deleted")))
      ))
    }

    it("should find tiff images when searching for file type 'tif'") {
      Parser.run("fileType:tif") should be (List(
        Match(SingleField(getFieldPath("mimeType")), Words("image/tiff")),
        Negation(Match(IsField,IsValue("deleted")))
      ))
    }

    it("should find tiff images when searching for file type 'tiff'") {
      Parser.run("fileType:tiff") should be (List(
        Match(SingleField(getFieldPath("mimeType")), Words("image/tiff")),
        Negation(Match(IsField,IsValue("deleted")))
      ))
    }

    it("should match multiple terms and the fileType query") {
      Parser.run("fileType:tiff cats dogs") should be (List(
        Match(SingleField(getFieldPath("mimeType")), Words("image/tiff")),
        Match(AnyField, Words("cats dogs")),
        Negation(Match(IsField,IsValue("deleted")))
      ))
    }

    it("should match negated fileType queries") {
      Parser.run("-fileType:jpeg") should be (List(
        Negation(Match(SingleField(getFieldPath("mimeType")), Words("image/jpeg"))),
        Negation(Match(IsField,IsValue("deleted")))
      ))
    }

    it("should match aliases and a fileType query") {
      Parser.run("by:cats fileType:tiff") should be (List(
        Match(bylineField, Words("cats")),
        Match(SingleField(getFieldPath("mimeType")), Words("image/tiff")),
        Negation(Match(IsField,IsValue("deleted")))
      ))
    }

    it("should not match unrelated file types") {
      Parser.run("fileType:catsdogs") should be (List(
        Match(SingleField("fileType"), Words("catsdogs")),
        Negation(Match(IsField,IsValue("deleted")))
      ))
    }
  }

  describe("quoted field search") {
    it("should match a quoted field search") {
      Parser.run(""""fieldDogs":cats""") should be (List(
        Match(SingleField("fieldDogs"), Words("cats")),
        Negation(Match(IsField,IsValue("deleted")))
      ))
    }

    it("should match a quoted field search with  colons") {
      Parser.run(""""fieldDogs:dinosaur:lemur":cats""") should be (List(
        Match(SingleField("fieldDogs:dinosaur:lemur"), Words("cats")),
        Negation(Match(IsField,IsValue("deleted")))
      ))
    }

    it("should match a quoted field search colons, and a search term with quotes and colons") {
      Parser.run(""""fieldDogs":"cats:are:fun"""") should be (List(
        Match(SingleField("fieldDogs"), Phrase("cats:are:fun")),
        Negation(Match(IsField,IsValue("deleted")))
      ))
    }

    it("should match a quoted field search with colons and spaces") {
      Parser.run(""""fieldDogs: dinosaur:lemur":cats""") should be (List(
        Match(SingleField("fieldDogs: dinosaur:lemur"), Words("cats")),
        Negation(Match(IsField,IsValue("deleted")))
      ))
    }

    it("should match a field search with colons and spaces") {
      Parser.run("fieldDogs : dinosaur:lemur:cats") should be (List(
        Match(AnyField,Words("fieldDogs :")),
        Match(SingleField("dinosaur"),Words("lemur:cats")),
        Negation(Match(IsField,IsValue("deleted")))
      ))
    }

    it("should match two field queries") {
      Parser.run("fieldDogs:dinosaur lemur:cats") should be (List(
        Match(SingleField("fieldDogs"),Words("dinosaur")),
        Match(SingleField("lemur"),Words("cats")),
        Negation(Match(IsField,IsValue("deleted")))
      ))
    }
  }
}
