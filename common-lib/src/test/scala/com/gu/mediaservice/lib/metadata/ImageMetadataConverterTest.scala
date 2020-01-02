package com.gu.mediaservice.lib.metadata

import com.gu.mediaservice.model.FileMetadata
import org.joda.time.{DateTime, DateTimeZone}
import org.scalatest.{FunSpec, Matchers}
import play.api.libs.json.JsString

class ImageMetadataConverterTest extends FunSpec with Matchers {

  it("should return an empty ImageMetadata for empty FileMetadata") {
    val fileMetadata = FileMetadata(Map(), Map(), Map(), Map())
    val imageMetadata = ImageMetadataConverter.fromFileMetadata(fileMetadata)
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
    imageMetadata.state should be ('empty)
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
      "Province/State" -> "the state",
      "Country/Primary Location Name" -> "the country"
    ), Map(
      "Copyright" -> "the copyright"
    ), Map(), Map())
    val imageMetadata = ImageMetadataConverter.fromFileMetadata(fileMetadata)

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
    imageMetadata.state should be (Some("the state"))
    imageMetadata.country should be (Some("the country"))
  }

  it("should fallback to Copyright Notice for copyright field of ImageMetadata if Copyright is missing") {
    val fileMetadata = FileMetadata(Map("Copyright Notice" -> "the copyright notice"), Map(), Map(), Map())
    val imageMetadata = ImageMetadataConverter.fromFileMetadata(fileMetadata)
    imageMetadata.copyrightNotice should be (Some("the copyright notice"))
  }

  it("should fallback to Object Name for suppliersReference field of ImageMetadata if Original Transmission Reference is missing") {
    val fileMetadata = FileMetadata(Map("Object Name" -> "the object name"), Map(), Map(), Map())
    val imageMetadata = ImageMetadataConverter.fromFileMetadata(fileMetadata)
    imageMetadata.suppliersReference should be (Some("the object name"))
  }


  // Date Taken

  private def parseDate(dateTime: String) = DateTime.parse(dateTime).withZone(DateTimeZone.UTC)

  it("should populate the dateTaken field of ImageMetadata from EXIF Date/Time Original Composite (Mon Jun 18 01:23:45 BST 2018)") {
    val fileMetadata = FileMetadata(iptc = Map(), exif = Map(), exifSub = Map("Date/Time Original Composite" -> "Mon Jun 18 01:23:45 BST 2018"), xmp = Map())
    val imageMetadata = ImageMetadataConverter.fromFileMetadata(fileMetadata)
    imageMetadata.dateTaken should be (Some(parseDate("2018-06-18T00:23:45Z")))
  }

  it("should populate the dateTaken field of ImageMetadata from EXIF Date/Time Original Composite with milliseconds (Mon Jun 18 01:23:45.025 BST 2018)") {
    val fileMetadata = FileMetadata(iptc = Map(), exif = Map(), exifSub = Map("Date/Time Original Composite" -> "Mon Jun 18 01:23:45.025 BST 2018"), xmp = Map())
    val imageMetadata = ImageMetadataConverter.fromFileMetadata(fileMetadata)
    imageMetadata.dateTaken should be (Some(parseDate("2018-06-18T00:23:45.025Z")))
  }

  it("should populate the dateTaken field of ImageMetadata from IPTC Date Time Created Composite (Mon Jun 18 01:23:45 BST 2018)") {
    val fileMetadata = FileMetadata(iptc = Map("Date Time Created Composite" -> "Mon Jun 18 01:23:45 BST 2018"), exif = Map(), exifSub = Map(), xmp = Map())
    val imageMetadata = ImageMetadataConverter.fromFileMetadata(fileMetadata)
    imageMetadata.dateTaken should be (Some(parseDate("2018-06-18T00:23:45Z")))
  }

  it("should populate the dateTaken field of ImageMetadata from XMP photoshop:DateCreated (2014-12-16T02:23:45+01:00)") {
    val fileMetadata = FileMetadata(iptc = Map(), exif = Map(), exifSub = Map(), xmp = Map("photoshop:DateCreated" -> JsString("2014-12-16T02:23:45+01:00")))
    val imageMetadata = ImageMetadataConverter.fromFileMetadata(fileMetadata)
    imageMetadata.dateTaken should be (Some(parseDate("2014-12-16T01:23:45Z")))
  }

  it("should populate the dateTaken field of ImageMetadata from XMP photoshop:DateCreated (2014-12-16T02:23+01:00)") {
    val fileMetadata = FileMetadata(iptc = Map(), exif = Map(), exifSub = Map(), xmp = Map("photoshop:DateCreated" -> JsString("2014-12-16T02:23+01:00")))
    val imageMetadata = ImageMetadataConverter.fromFileMetadata(fileMetadata)
    imageMetadata.dateTaken should be (Some(parseDate("2014-12-16T01:23:00Z")))
  }

  it("should populate the dateTaken field of ImageMetadata from XMP photoshop:DateCreated (2018-06-27T13:54:55)") {
    val fileMetadata = FileMetadata(iptc = Map(), exif = Map(), exifSub = Map(), xmp = Map("photoshop:DateCreated" -> JsString("2018-06-27T13:54:55")))
    val imageMetadata = ImageMetadataConverter.fromFileMetadata(fileMetadata)
    imageMetadata.dateTaken should be (Some(parseDate("2018-06-27T13:54:55Z")))
  }

  it("should populate the dateTaken field of ImageMetadata from XMP photoshop:DateCreated (2018-06-27T13:54:55.123)") {
    val fileMetadata = FileMetadata(iptc = Map(), exif = Map(), exifSub = Map(), xmp = Map("photoshop:DateCreated" -> JsString("2018-06-27T13:54:55.123")))
    val imageMetadata = ImageMetadataConverter.fromFileMetadata(fileMetadata)
    imageMetadata.dateTaken should be (Some(parseDate("2018-06-27T13:54:55.123Z")))
  }

  it("should populate the dateTaken field of ImageMetadata from XMP photoshop:DateCreated (Tue Dec 16 01:23:45 GMT 2014)") {
    val fileMetadata = FileMetadata(iptc = Map(), exif = Map(), exifSub = Map(), xmp = Map("photoshop:DateCreated" -> JsString("Tue Dec 16 01:23:45 GMT 2014")))
    val imageMetadata = ImageMetadataConverter.fromFileMetadata(fileMetadata)
    imageMetadata.dateTaken should be (Some(parseDate("2014-12-16T01:23:45Z")))
  }

  it("should populate the dateTaken field of ImageMetadata from XMP photoshop:DateCreated (Tue Dec 16 01:23:45 UTC 2014)") {
    val fileMetadata = FileMetadata(iptc = Map(), exif = Map(), exifSub = Map(), xmp = Map("photoshop:DateCreated" -> JsString("Tue Dec 16 01:23:45 UTC 2014")))
    val imageMetadata = ImageMetadataConverter.fromFileMetadata(fileMetadata)
    imageMetadata.dateTaken should be (Some(parseDate("2014-12-16T01:23:45Z")))
  }

  it("should populate the dateTaken field of ImageMetadata from XMP photoshop:DateCreated (Tue Dec 16 01:23:45 BST 2014)") {
    val fileMetadata = FileMetadata(iptc = Map(), exif = Map(), exifSub = Map(), xmp = Map("photoshop:DateCreated" -> JsString("Tue Dec 16 01:23:45 BST 2014")))
    val imageMetadata = ImageMetadataConverter.fromFileMetadata(fileMetadata)
    imageMetadata.dateTaken should be (Some(parseDate("2014-12-16T00:23:45Z")))
  }

  it("should populate the dateTaken field of ImageMetadata from XMP photoshop:DateCreated (Tue Dec 16 01:23:45 PDT 2014)") {
    val fileMetadata = FileMetadata(iptc = Map(), exif = Map(), exifSub = Map(), xmp = Map("photoshop:DateCreated" -> JsString("Tue Dec 16 01:23:45 PDT 2014")))
    val imageMetadata = ImageMetadataConverter.fromFileMetadata(fileMetadata)
    imageMetadata.dateTaken should be (Some(parseDate("2014-12-16T01:23:45-08:00")))
  }

  it("should populate the dateTaken field of ImageMetadata from XMP photoshop:DateCreated (2014-12-16)") {
    val fileMetadata = FileMetadata(iptc = Map(), exif = Map(), exifSub = Map(), xmp = Map("photoshop:DateCreated" -> JsString("2014-12-16")))
    val imageMetadata = ImageMetadataConverter.fromFileMetadata(fileMetadata)
    imageMetadata.dateTaken should be (Some(DateTime.parse("2014-12-16T00:00:00Z")))
  }

  it("should leave the dateTaken field of ImageMetadata empty if no date present") {
    val fileMetadata = FileMetadata(iptc = Map(), exif = Map(), exifSub = Map(), xmp = Map())
    val imageMetadata = ImageMetadataConverter.fromFileMetadata(fileMetadata)
    imageMetadata.dateTaken should be (None)
  }

  it("should leave the dateTaken field of ImageMetadata empty if EXIF Date/Time Original Composite is not a valid date") {
    val fileMetadata = FileMetadata(iptc = Map(), exif = Map(), exifSub = Map("Date/Time Original Composite" -> "not a date"), xmp = Map())
    val imageMetadata = ImageMetadataConverter.fromFileMetadata(fileMetadata)
    imageMetadata.dateTaken should be (None)
  }

  it("should leave the dateTaken field of ImageMetadata empty if IPTC Date Time Created Composite is not a valid date") {
    val fileMetadata = FileMetadata(iptc = Map("Date Time Created Composite" -> "not a date"), exif = Map(), exifSub = Map(), xmp = Map())
    val imageMetadata = ImageMetadataConverter.fromFileMetadata(fileMetadata)
    imageMetadata.dateTaken should be (None)
  }

  it("should leave the dateTaken field of ImageMetadata empty if XMP photoshop:DateCreated is not a valid date") {
    val fileMetadata = FileMetadata(iptc = Map(), exif = Map(), exifSub = Map(), xmp = Map("photoshop:DateCreated" -> JsString("not a date")))
    val imageMetadata = ImageMetadataConverter.fromFileMetadata(fileMetadata)
    imageMetadata.dateTaken should be (None)
  }

  // Keywords

  it("should populate keywords field of ImageMetadata from comma-separated list of keywords") {
    val fileMetadata = FileMetadata(Map("Keywords" -> "Foo,Bar, Baz"), Map(), Map(), Map())
    val imageMetadata = ImageMetadataConverter.fromFileMetadata(fileMetadata)
    imageMetadata.keywords should be (List("Foo", "Bar", "Baz"))
  }

  it("should populate keywords field of ImageMetadata from semi-colon-separated list of keywords") {
    val fileMetadata = FileMetadata(Map("Keywords" -> "Foo;Bar; Baz"), Map(), Map(), Map())
    val imageMetadata = ImageMetadataConverter.fromFileMetadata(fileMetadata)
    imageMetadata.keywords should be (List("Foo", "Bar", "Baz"))
  }

  it("should leave non-dates alone") {
    ImageMetadataConverter.cleanDate("banana") shouldBe "banana"
  }

  it("should clean up 'just date' dates into iso format") {
    ImageMetadataConverter.cleanDate("2014-12-16") shouldBe "2014-12-16T00:00:00.000Z"
  }

  it("should clean up iso dates with seconds into iso format") {
    ImageMetadataConverter.cleanDate("2014-12-16T01:02:03.040Z") shouldBe "2014-12-16T01:02:03.040Z"
  }

  it("should clean up iso dates without sub-second precision into iso format") {
    ImageMetadataConverter.cleanDate("2014-12-16T01:02:03Z") shouldBe "2014-12-16T01:02:03.000Z"
  }

  it("should clean up iso dates without seconds into iso format") {
    ImageMetadataConverter.cleanDate("2014-12-16T01:02Z") shouldBe "2014-12-16T01:02:00.000Z"
  }

  it("should clean up iso dates without seconds but with fractional seconds 'lol' into iso format") {
    ImageMetadataConverter.cleanDate("2014-12-16T01:02.040Z") shouldBe "2014-12-16T01:02:00.040Z"
  }

  it("should clean up machine dates with GMT time zone with subsecond precision into iso format") {
    ImageMetadataConverter.cleanDate("Tue Dec 16 01:02:03.040 GMT 2014") shouldBe "2014-12-16T01:02:03.040Z"
  }

  it("should clean up machine dates with GMT time zone without subsecond precision into iso format") {
    ImageMetadataConverter.cleanDate("Tue Dec 16 01:02:03 GMT 2014") shouldBe "2014-12-16T01:02:03.000Z"
  }

  it("should clean up machine dates with valid BST time zone and subsecond precision into iso format") {
    ImageMetadataConverter.cleanDate("Sat Aug 16 01:02:03.040 BST 2014") shouldBe "2014-08-16T00:02:03.040Z"
  }

  it("should clean up machine dates with valid BST time zone without subsecond precision into iso format") {
    ImageMetadataConverter.cleanDate("Sat Aug 16 01:02:03 BST 2014") shouldBe "2014-08-16T00:02:03.000Z"
  }

  it("should clean up machine dates with invalid BST time zone and subsecond precision into iso format") {
    ImageMetadataConverter.cleanDate("Tue Dec 16 01:02:03.040 BST 2014") shouldBe "2014-12-16T00:02:03.040Z"
  }

  it("should clean up machine dates with invalid BST time zone without subsecond precision into iso format") {
    ImageMetadataConverter.cleanDate("Tue Dec 16 01:02:03 BST 2014") shouldBe "2014-12-16T00:02:03.000Z"
  }



}
