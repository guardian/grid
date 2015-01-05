package scala.lib.imaging

import lib.imaging.{FileMetadata, ImageMetadata}
import org.joda.time.{DateTimeZone, DateTime}
import org.scalatest.{Matchers, FunSpec}

class ImageMetadataTest extends FunSpec with Matchers {

  it("should return an empty ImageMetadata for empty FileMetadata") {
    val fileMetadata = FileMetadata(Map(), Map(), Map(), Map())
    val imageMetadata = ImageMetadata.fromFileMetadata(fileMetadata)
    imageMetadata.dateTaken should be ('empty)
    imageMetadata.description should be ('empty)
    imageMetadata.credit should be ('empty)
    imageMetadata.byline should be ('empty)
    imageMetadata.bylineTitle should be ('empty)
    imageMetadata.title should be ('empty)
    imageMetadata.copyrightNotice should be ('empty)
    imageMetadata.copyright should be ('empty)
    imageMetadata.suppliersReference should be ('empty)
    imageMetadata.source should be ('empty)
    imageMetadata.specialInstructions should be ('empty)
    imageMetadata.keywords should be ('empty)
    imageMetadata.subLocation should be ('empty)
    imageMetadata.city should be ('empty)
    imageMetadata.province should be ('empty)
    imageMetadata.country should be ('empty)
  }

  it("should populate string fields of ImageMetadata from default FileMetadata fields") {
    val fileMetadata = FileMetadata(Map(
      "Caption/Abstract" -> "the description",
      "Credit" -> "the credit",
      "By-line" -> "the byline",
      "By-line Title" -> "the byline title",
      "Headline" -> "the title",
      "Copyright Notice" -> "the copyright notice",
      "Original Transmission Reference" -> "the suppliers reference",
      "Source" -> "the source",
      "Special Instructions" -> "the special instructions",
      "Sub-location" -> "the sub location",
      "City" -> "the city",
      "Province/State" -> "the province",
      "Country/Primary Location Name" -> "the country"
    ), Map(
      "Copyright" -> "the copyright"
    ), Map(), Map())
    val imageMetadata = ImageMetadata.fromFileMetadata(fileMetadata)

    imageMetadata.description should be (Some("the description"))
    imageMetadata.credit should be (Some("the credit"))
    imageMetadata.byline should be (Some("the byline"))
    imageMetadata.bylineTitle should be (Some("the byline title"))
    imageMetadata.title should be (Some("the title"))
    imageMetadata.copyrightNotice should be (Some("the copyright notice"))
    imageMetadata.copyright should be (Some("the copyright"))
    imageMetadata.suppliersReference should be (Some("the suppliers reference"))
    imageMetadata.source should be (Some("the source"))
    imageMetadata.specialInstructions should be (Some("the special instructions"))
    imageMetadata.subLocation should be (Some("the sub location"))
    imageMetadata.city should be (Some("the city"))
    imageMetadata.province should be (Some("the province"))
    imageMetadata.country should be (Some("the country"))
  }

  it("should fallback to Copyright Notice for copyright field of ImageMetadata if Copyright is missing") {
    val fileMetadata = FileMetadata(Map("Copyright Notice" -> "the copyright notice"), Map(), Map(), Map())
    val imageMetadata = ImageMetadata.fromFileMetadata(fileMetadata)
    imageMetadata.copyrightNotice should be (Some("the copyright notice"))
  }

  it("should fallback to Object Name for suppliersReference field of ImageMetadata if Original Transmission Reference is missing") {
    val fileMetadata = FileMetadata(Map("Object Name" -> "the object name"), Map(), Map(), Map())
    val imageMetadata = ImageMetadata.fromFileMetadata(fileMetadata)
    imageMetadata.suppliersReference should be (Some("the object name"))
  }


  // Date Taken

  def normalizeDate(dateTime: DateTime) = dateTime.withZone(DateTimeZone.UTC)

  it("should populate the dateTaken field of ImageMetadata from IPTC Date Created (2014-12-16T02:23:45+01:00)") {
    val fileMetadata = FileMetadata(Map("Date Created" -> "2014-12-16T02:23:45+01:00"), Map(), Map(), Map())
    val imageMetadata = ImageMetadata.fromFileMetadata(fileMetadata)
    imageMetadata.dateTaken should be (Some(DateTime.parse("2014-12-16T01:23:45Z")))
  }

  it("should populate the dateTaken field of ImageMetadata from IPTC Date Created (2014-12-16T02:23+01:00)") {
    val fileMetadata = FileMetadata(Map("Date Created" -> "2014-12-16T02:23+01:00"), Map(), Map(), Map())
    val imageMetadata = ImageMetadata.fromFileMetadata(fileMetadata)
    imageMetadata.dateTaken should be (Some(DateTime.parse("2014-12-16T01:23:00Z")))
  }

  it("should populate the dateTaken field of ImageMetadata from IPTC Date Created (Tue Dec 16 01:23:45 GMT 2014)") {
    val fileMetadata = FileMetadata(Map("Date Created" -> "Tue Dec 16 01:23:45 GMT 2014"), Map(), Map(), Map())
    val imageMetadata = ImageMetadata.fromFileMetadata(fileMetadata)
    imageMetadata.dateTaken should be (Some(DateTime.parse("2014-12-16T01:23:45Z")))
  }

  it("should populate the dateTaken field of ImageMetadata from IPTC Date Created (Tue Dec 16 01:23:45 UTC 2014)") {
    val fileMetadata = FileMetadata(Map("Date Created" -> "Tue Dec 16 01:23:45 UTC 2014"), Map(), Map(), Map())
    val imageMetadata = ImageMetadata.fromFileMetadata(fileMetadata)
    imageMetadata.dateTaken should be (Some(DateTime.parse("2014-12-16T01:23:45Z")))
  }

  it("should populate the dateTaken field of ImageMetadata from IPTC Date Created (Tue Dec 16 01:23:45 BST 2014)") {
    val fileMetadata = FileMetadata(Map("Date Created" -> "Tue Dec 16 01:23:45 BST 2014"), Map(), Map(), Map())
    val imageMetadata = ImageMetadata.fromFileMetadata(fileMetadata)
    imageMetadata.dateTaken should be (Some(DateTime.parse("2014-12-16T01:23:45+01:00").withZone(DateTimeZone.UTC)))
  }

  it("should populate the dateTaken field of ImageMetadata from IPTC Date Created (Tue Dec 16 01:23:45 PDT 2014)") {
    val fileMetadata = FileMetadata(Map("Date Created" -> "Tue Dec 16 01:23:45 PDT 2014"), Map(), Map(), Map())
    val imageMetadata = ImageMetadata.fromFileMetadata(fileMetadata)
    imageMetadata.dateTaken should be (Some(DateTime.parse("2014-12-16T01:23:45-08:00").withZone(DateTimeZone.UTC)))
  }

  it("should populate the dateTaken field of ImageMetadata from IPTC Date Created (2014-12-16)") {
    val fileMetadata = FileMetadata(Map("Date Created" -> "2014-12-16"), Map(), Map(), Map())
    val imageMetadata = ImageMetadata.fromFileMetadata(fileMetadata)
    imageMetadata.dateTaken should be (Some(DateTime.parse("2014-12-16T00:00:00Z")))
  }

  it("should leave the dateTaken field of ImageMetadata empty if IPTC Date Created is not a valid date") {
    val fileMetadata = FileMetadata(Map("Date Created" -> "not a date"), Map(), Map(), Map())
    val imageMetadata = ImageMetadata.fromFileMetadata(fileMetadata)
    imageMetadata.dateTaken should be ('empty)
  }


  it("should populate the dateTaken field of ImageMetadata from EXIF Sub Date/Time Original if present") {
    // Thankfully standard datetime format (albeit weird and with no TZ offset)
    val fileMetadata = FileMetadata(Map(), Map(), Map("Date/Time Original" -> "2014:12:16 01:23:45"), Map())
    val imageMetadata = ImageMetadata.fromFileMetadata(fileMetadata)
    // Note: we assume UTC as timezone (not necessarily correct but no way to tell)
    imageMetadata.dateTaken should be (Some(new DateTime("2014-12-16T01:23:45Z")))
  }

  it("should leave the dateTaken field of ImageMetadata empty if EXIF Sub Date/Time Original is not a valid date") {
    // Thankfully standard datetime format (albeit weird and with no TZ offset)
    val fileMetadata = FileMetadata(Map(), Map(), Map("Date/Time Original" -> "not a date"), Map())
    val imageMetadata = ImageMetadata.fromFileMetadata(fileMetadata)
    imageMetadata.dateTaken should be ('empty)
  }


  // Keywords

  it("should populate keywords field of ImageMetadata from comma-separated list of keywords") {
    val fileMetadata = FileMetadata(Map("Keywords" -> "Foo,Bar, Baz"), Map(), Map(), Map())
    val imageMetadata = ImageMetadata.fromFileMetadata(fileMetadata)
    imageMetadata.keywords should be (List("Foo", "Bar", "Baz"))
  }

  it("should populate keywords field of ImageMetadata from semi-colon-separated list of keywords") {
    val fileMetadata = FileMetadata(Map("Keywords" -> "Foo;Bar; Baz"), Map(), Map(), Map())
    val imageMetadata = ImageMetadata.fromFileMetadata(fileMetadata)
    imageMetadata.keywords should be (List("Foo", "Bar", "Baz"))
  }

}
