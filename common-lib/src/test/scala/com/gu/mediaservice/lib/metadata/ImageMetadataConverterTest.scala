package com.gu.mediaservice.lib.metadata

import com.gu.mediaservice.model.FileMetadata
import org.joda.time.format.{DateTimeFormat, DateTimeFormatter}
import org.joda.time.{DateTime, DateTimeZone}
import org.scalatest.{FunSpec, Matchers}
import play.api.libs.json.{JsArray, JsString}

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
    imageMetadata.copyright should be ('empty)
    imageMetadata.suppliersReference should be ('empty)
    imageMetadata.source should be ('empty)
    imageMetadata.specialInstructions should be ('empty)
    imageMetadata.keywords should be ('empty)
    imageMetadata.subLocation should be ('empty)
    imageMetadata.city should be ('empty)
    imageMetadata.state should be ('empty)
    imageMetadata.country should be ('empty)
    imageMetadata.peopleInImage should be ('empty)
  }

  it("should populate string fields of ImageMetadata from default FileMetadata fields") {
    val fileMetadata = FileMetadata(
      iptc = Map(
        "Caption/Abstract" -> "the description",
        "Credit" -> "the credit",
        "By-line" -> "the byline",
        "By-line Title" -> "the byline title",
        "Headline" -> "the title",
        "Original Transmission Reference" -> "the suppliers reference",
        "Source" -> "the source",
        "Special Instructions" -> "the special instructions",
        "Sub-location" -> "the sub location",
        "City" -> "the city",
        "Province/State" -> "the state",
        "Country/Primary Location Name" -> "the country"
      ),
      exif = Map(
        "Copyright" -> "the copyright"
      ),
      exifSub = Map(

      ),
      xmp = Map()
    )
    val imageMetadata = ImageMetadataConverter.fromFileMetadata(fileMetadata)

    imageMetadata.description should be(Some("the description"))
    imageMetadata.credit should be(Some("the credit"))
    imageMetadata.byline should be(Some("the byline"))
    imageMetadata.bylineTitle should be(Some("the byline title"))
    imageMetadata.title should be(Some("the title"))
    imageMetadata.copyright should be(Some("the copyright"))
    imageMetadata.suppliersReference should be(Some("the suppliers reference"))
    imageMetadata.source should be(Some("the source"))
    imageMetadata.specialInstructions should be(Some("the special instructions"))
    imageMetadata.subLocation should be(Some("the sub location"))
    imageMetadata.city should be(Some("the city"))
    imageMetadata.state should be(Some("the state"))
    imageMetadata.country should be(Some("the country"))
  }

  it("should populate string fields of ImageMetadata from default FileMetadata fields mainly from xmp") {
    val fileMetadata = FileMetadata(
      iptc = Map(
        "Caption/Abstract" -> "the description",
        "Credit" -> "the credit",
        "By-line" -> "the byline",
        "By-line Title" -> "the byline title",
        "Headline" -> "the title",
        "Original Transmission Reference" -> "the suppliers reference",
        "Source" -> "the source",
        "Special Instructions" -> "the special instructions",
        "Sub-location" -> "the sub location",
        "City" -> "the city",
        "Province/State" -> "the state",
        "Country/Primary Location Name" -> "the country"
      ),
      exif = Map(
        "Copyright" -> "the copyright"
      ),
      exifSub = Map(

      ),
      xmp = Map(
        "dc:description" -> JsArray(Seq(
          JsString("the xmp description"),
          JsArray(Seq("{'xml:lang':'x-default'}").map(JsString)),
        )),
        "dc:title" -> JsArray(Seq(
          JsString("the xmp title"),
          JsArray(Seq("{'xml:lang':'x-default'}").map(JsString)),
        )),
        "dc:creator" -> JsArray(Seq(JsString("xmp creator"))),
        "photoshop:DateCreated" -> JsString("2018-06-27T13:54:55"),
        "photoshop:Credit" -> JsString("xmp credit"),
        "photoshop:AuthorsPosition" -> JsString("xmp byline title"),
        "photoshop:Headline" -> JsString("xmp "),
        "dc:Rights" -> JsString("xmp copyright"),
        "photoshop:TransmissionReference" -> JsString("xmp suppliersReference"),
        "photoshop:Source" -> JsString("xmp source"),
        "photoshop:Instructions" -> JsString("xmp specialInstructions"),
        "Iptc4xmpCore:Location" -> JsString("xmp subLocation"),
        "photoshop:City" -> JsString("xmp City"),
        "photoshop:State" -> JsString("xmp State"),
        "photoshop:Country" -> JsString("xmp Country"),
      )
    )
    val imageMetadata = ImageMetadataConverter.fromFileMetadata(fileMetadata)

    imageMetadata.description should be(Some("the xmp description"))
    imageMetadata.credit should be(Some("xmp credit"))
    imageMetadata.byline should be(Some("xmp creator"))
    imageMetadata.dateTaken should be(Some(parseDate("2018-06-27T13:54:55Z")))
    imageMetadata.bylineTitle should be(Some("xmp byline title"))
    imageMetadata.title should be(Some("xmp "))
    imageMetadata.copyright should be(Some("xmp copyright"))
    imageMetadata.suppliersReference should be(Some("xmp suppliersReference"))
    imageMetadata.source should be(Some("xmp source"))
    imageMetadata.specialInstructions should be(Some("xmp specialInstructions"))
    imageMetadata.subLocation should be(Some("xmp subLocation"))
    imageMetadata.city should be(Some("xmp City"))
    imageMetadata.state should be(Some("xmp State"))
    imageMetadata.country should be(Some("xmp Country"))
  }

  it("should populate string fields of ImageMetadata from xmp fileMetadata properly " +
    "even if xmp input had mixed order of entries") {
    val fileMetadata = FileMetadata(
      xmp = Map(
        "dc:description" -> JsArray(Seq(
          JsArray(Seq("{'xml:lang':'x-default'}").map(JsString)),
          JsString("the xmp description"),
        )),
        "dc:title" -> JsArray(Seq(
          JsArray(Seq(
            "{'test:2':'test2'}",
            "{'xml:lang':'x-default'}",
            "{'test:1':'test1'}",
          ).map(JsString)),
          JsString("the xmp title"),
          JsArray(Seq(
            "{'test:3':'test3'}",
          ).map(JsString)),
        )),
        "dc:creator" -> JsArray(Seq(JsString("xmp creator"))),
        "photoshop:DateCreated" -> JsString("2018-06-27T13:54:55"),
        "photoshop:Credit" -> JsString("xmp credit"),
        "photoshop:AuthorsPosition" -> JsString("xmp byline title"),
        "photoshop:Headline" -> JsString("xmp "),
        "dc:Rights" -> JsString("xmp copyright"),
        "photoshop:TransmissionReference" -> JsString("xmp suppliersReference"),
        "photoshop:Source" -> JsString("xmp source"),
        "photoshop:Instructions" -> JsString("xmp specialInstructions"),
        "Iptc4xmpCore:Location" -> JsString("xmp subLocation"),
        "photoshop:City" -> JsString("xmp City"),
        "photoshop:State" -> JsString("xmp State"),
        "photoshop:Country" -> JsString("xmp Country"),
      )
    )
    val imageMetadata = ImageMetadataConverter.fromFileMetadata(fileMetadata)

    imageMetadata.description should be(Some("the xmp description"))
    imageMetadata.credit should be(Some("xmp credit"))
    imageMetadata.byline should be(Some("xmp creator"))
    imageMetadata.dateTaken should be(Some(parseDate("2018-06-27T13:54:55Z")))
    imageMetadata.bylineTitle should be(Some("xmp byline title"))
    imageMetadata.title should be(Some("xmp "))
    imageMetadata.copyright should be(Some("xmp copyright"))
    imageMetadata.suppliersReference should be(Some("xmp suppliersReference"))
    imageMetadata.source should be(Some("xmp source"))
    imageMetadata.specialInstructions should be(Some("xmp specialInstructions"))
    imageMetadata.subLocation should be(Some("xmp subLocation"))
    imageMetadata.city should be(Some("xmp City"))
    imageMetadata.state should be(Some("xmp State"))
    imageMetadata.country should be(Some("xmp Country"))
  }

  it("should fallback to Object Name for suppliersReference field of ImageMetadata if Original Transmission Reference is missing") {
    val fileMetadata = FileMetadata(Map("Object Name" -> "the object name"), Map(), Map(), Map())
    val imageMetadata = ImageMetadataConverter.fromFileMetadata(fileMetadata)
    imageMetadata.suppliersReference should be(Some("the object name"))
  }


  // Date Taken

  private def parseDate(dateTime: String) = DateTime.parse(dateTime).withZone(DateTimeZone.UTC)

  it("should populate the dateTaken field of ImageMetadata from EXIF Date/Time Original Composite (Mon Jun 18 01:23:45 BST 2018)") {
    val fileMetadata = FileMetadata(iptc = Map(), exif = Map(), exifSub = Map("Date/Time Original Composite" -> "Mon Jun 18 01:23:45 BST 2018"), xmp = Map())
    val imageMetadata = ImageMetadataConverter.fromFileMetadata(fileMetadata)
    imageMetadata.dateTaken should be(Some(parseDate("2018-06-18T00:23:45Z")))
  }

  it("should populate the dateTaken field of ImageMetadata from EXIF Date/Time Original Composite with milliseconds (Mon Jun 18 01:23:45.025 BST 2018)") {
    val fileMetadata = FileMetadata(iptc = Map(), exif = Map(), exifSub = Map("Date/Time Original Composite" -> "Mon Jun 18 01:23:45.025 BST 2018"), xmp = Map())
    val imageMetadata = ImageMetadataConverter.fromFileMetadata(fileMetadata)
    imageMetadata.dateTaken should be(Some(parseDate("2018-06-18T00:23:45.025Z")))
  }

  it("should populate the dateTaken field of ImageMetadata from IPTC Date Time Created Composite (Mon Jun 18 01:23:45 BST 2018)") {
    val fileMetadata = FileMetadata(iptc = Map("Date Time Created Composite" -> "Mon Jun 18 01:23:45 BST 2018"), exif = Map(), exifSub = Map(), xmp = Map())
    val imageMetadata = ImageMetadataConverter.fromFileMetadata(fileMetadata)
    imageMetadata.dateTaken should be(Some(parseDate("2018-06-18T00:23:45Z")))
  }

  it("should populate the dateTaken field of ImageMetadata from XMP photoshop:DateCreated (2014-12-16T02:23:45+01:00)") {
    val fileMetadata = FileMetadata(iptc = Map(), exif = Map(), exifSub = Map(), xmp = Map("photoshop:DateCreated" -> JsString("2014-12-16T02:23:45+01:00")))
    val imageMetadata = ImageMetadataConverter.fromFileMetadata(fileMetadata)
    imageMetadata.dateTaken should be(Some(parseDate("2014-12-16T01:23:45Z")))
  }

  it("should populate the dateTaken field of ImageMetadata from XMP photoshop:DateCreated (2014-12-16T02:23+01:00)") {
    val fileMetadata = FileMetadata(iptc = Map(), exif = Map(), exifSub = Map(), xmp = Map("photoshop:DateCreated" -> JsString("2014-12-16T02:23+01:00")))
    val imageMetadata = ImageMetadataConverter.fromFileMetadata(fileMetadata)
    imageMetadata.dateTaken should be(Some(parseDate("2014-12-16T01:23:00Z")))
  }

  it("should populate the dateTaken field of ImageMetadata from XMP photoshop:DateCreated (2018-06-27T13:54:55)") {
    val fileMetadata = FileMetadata(iptc = Map(), exif = Map(), exifSub = Map(), xmp = Map("photoshop:DateCreated" -> JsString("2018-06-27T13:54:55")))
    val imageMetadata = ImageMetadataConverter.fromFileMetadata(fileMetadata)
    imageMetadata.dateTaken should be(Some(parseDate("2018-06-27T13:54:55Z")))
  }

  it("should populate the dateTaken field of ImageMetadata from XMP photoshop:DateCreated (2018-06-27T13:54:55.123)") {
    val fileMetadata = FileMetadata(iptc = Map(), exif = Map(), exifSub = Map(), xmp = Map("photoshop:DateCreated" -> JsString("2018-06-27T13:54:55.123")))
    val imageMetadata = ImageMetadataConverter.fromFileMetadata(fileMetadata)
    imageMetadata.dateTaken should be(Some(parseDate("2018-06-27T13:54:55.123Z")))
  }

  it("should populate the dateTaken field of ImageMetadata from XMP photoshop:DateCreated (Tue Dec 16 01:23:45 GMT 2014)") {
    val fileMetadata = FileMetadata(iptc = Map(), exif = Map(), exifSub = Map(), xmp = Map("photoshop:DateCreated" -> JsString("Tue Dec 16 01:23:45 GMT 2014")))
    val imageMetadata = ImageMetadataConverter.fromFileMetadata(fileMetadata)
    imageMetadata.dateTaken should be(Some(parseDate("2014-12-16T01:23:45Z")))
  }

  it("should populate the dateTaken field of ImageMetadata from XMP photoshop:DateCreated (Tue Dec 16 01:23:45 UTC 2014)") {
    val fileMetadata = FileMetadata(iptc = Map(), exif = Map(), exifSub = Map(), xmp = Map("photoshop:DateCreated" -> JsString("Tue Dec 16 01:23:45 UTC 2014")))
    val imageMetadata = ImageMetadataConverter.fromFileMetadata(fileMetadata)
    imageMetadata.dateTaken should be(Some(parseDate("2014-12-16T01:23:45Z")))
  }

  it("should populate the dateTaken field of ImageMetadata from XMP photoshop:DateCreated (Tue Dec 16 01:23:45 BST 2014)") {
    val fileMetadata = FileMetadata(iptc = Map(), exif = Map(), exifSub = Map(), xmp = Map("photoshop:DateCreated" -> JsString("Tue Dec 16 01:23:45 BST 2014")))
    val imageMetadata = ImageMetadataConverter.fromFileMetadata(fileMetadata)
    imageMetadata.dateTaken should be(Some(parseDate("2014-12-16T00:23:45Z")))
  }

  it("should populate the dateTaken field of ImageMetadata from XMP photoshop:DateCreated (Tue Dec 16 01:23:45 PDT 2014)") {
    val fileMetadata = FileMetadata(iptc = Map(), exif = Map(), exifSub = Map(), xmp = Map("photoshop:DateCreated" -> JsString("Tue Dec 16 01:23:45 PDT 2014")))
    val imageMetadata = ImageMetadataConverter.fromFileMetadata(fileMetadata)
    imageMetadata.dateTaken should be(Some(parseDate("2014-12-16T01:23:45-08:00")))
  }

  it("should populate the dateTaken field of ImageMetadata from XMP photoshop:DateCreated (2014-12-16)") {
    val fileMetadata = FileMetadata(iptc = Map(), exif = Map(), exifSub = Map(), xmp = Map("photoshop:DateCreated" -> JsString("2014-12-16")))
    val imageMetadata = ImageMetadataConverter.fromFileMetadata(fileMetadata)
    imageMetadata.dateTaken should be(Some(DateTime.parse("2014-12-16T00:00:00Z")))
  }

  it("should leave the dateTaken field of ImageMetadata empty if no date present") {
    val fileMetadata = FileMetadata(iptc = Map(), exif = Map(), exifSub = Map(), xmp = Map())
    val imageMetadata = ImageMetadataConverter.fromFileMetadata(fileMetadata)
    imageMetadata.dateTaken should be(None)
  }

  it("should leave the dateTaken field of ImageMetadata empty if EXIF Date/Time Original Composite is not a valid date") {
    val fileMetadata = FileMetadata(iptc = Map(), exif = Map(), exifSub = Map("Date/Time Original Composite" -> "not a date"), xmp = Map())
    val imageMetadata = ImageMetadataConverter.fromFileMetadata(fileMetadata)
    imageMetadata.dateTaken should be(None)
  }

  it("should leave the dateTaken field of ImageMetadata empty if IPTC Date Time Created Composite is not a valid date") {
    val fileMetadata = FileMetadata(iptc = Map("Date Time Created Composite" -> "not a date"), exif = Map(), exifSub = Map(), xmp = Map())
    val imageMetadata = ImageMetadataConverter.fromFileMetadata(fileMetadata)
    imageMetadata.dateTaken should be(None)
  }

  it("should leave the dateTaken field of ImageMetadata empty if XMP photoshop:DateCreated is not a valid date") {
    val fileMetadata = FileMetadata(iptc = Map(), exif = Map(), exifSub = Map(), xmp = Map("photoshop:DateCreated" -> JsString("not a date")))
    val imageMetadata = ImageMetadataConverter.fromFileMetadata(fileMetadata)
    imageMetadata.dateTaken should be(None)
  }

  // Keywords

  it("should populate keywords field of ImageMetadata from comma-separated list of keywords") {
    val fileMetadata = FileMetadata(Map("Keywords" -> "Foo,Bar, Baz"), Map(), Map(), Map())
    val imageMetadata = ImageMetadataConverter.fromFileMetadata(fileMetadata)
    imageMetadata.keywords should be(List("Foo", "Bar", "Baz"))
  }

  it("should populate keywords field of ImageMetadata from semi-colon-separated list of keywords") {
    val fileMetadata = FileMetadata(Map("Keywords" -> "Foo;Bar; Baz"), Map(), Map(), Map())
    val imageMetadata = ImageMetadataConverter.fromFileMetadata(fileMetadata)
    imageMetadata.keywords should be(List("Foo", "Bar", "Baz"))
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


  // People in Image

  it("should populate peopleInImage field of ImageMetadata from corresponding xmp iptc ext fields") {
    val fileMetadata = FileMetadata(Map(), Map(), Map(), Map("Iptc4xmpExt:PersonInImage" -> JsArray(Seq(JsString("person 1")))))
    val imageMetadata = ImageMetadataConverter.fromFileMetadata(fileMetadata)
    imageMetadata.peopleInImage should be (Set("person 1"))
  }

  it("should populate peopleInImage field of ImageMetadata from multiple corresponding people xmp fields") {
    val fileMetadata = FileMetadata(
      Map(), Map(), Map(),
      Map("Iptc4xmpExt:PersonInImage" ->
        JsArray(Seq(
          JsString("person 1"),
          JsString("person 2"),
          JsString("person 3"))),
      "GettyImagesGIFT:Personality" ->
      JsArray(Seq(JsString("person 4")))
      )
    )
    val imageMetadata = ImageMetadataConverter.fromFileMetadata(fileMetadata)
    imageMetadata.peopleInImage should be (Set("person 1","person 2","person 3","person 4"))
  }

  it("should distinctly populate peopleInImage field of ImageMetadata from multiple corresponding xmp iptc ext fields") {
    val fileMetadata = FileMetadata(Map(), Map(), Map(),
      Map("Iptc4xmpExt:PersonInImage" ->
        JsArray(Seq(
          JsString("person 1"),
          JsString("person 2"),
          JsString("person 2")
        ))
      ))
    val imageMetadata = ImageMetadataConverter.fromFileMetadata(fileMetadata)
    imageMetadata.peopleInImage should be (Set("person 1","person 2"))
  }

  it("should distinctly populate peopleInImage field of ImageMetadata from multiple corresponding xmp people fields") {
    val fileMetadata = FileMetadata(Map(), Map(), Map(),
      Map(
        "Iptc4xmpExt:PersonInImage" -> JsArray(Seq(
          JsString("person 1"),
          JsString("person 2")
        )),
        "GettyImagesGIFT:Personality" -> JsArray(Seq(
          JsString("person 2")
        ))
      )
    )
    val imageMetadata = ImageMetadataConverter.fromFileMetadata(fileMetadata)
    imageMetadata.peopleInImage should be (Set("person 1","person 2"))
  }

  private def day(y:Int, M:Int = 1, d:Int = 1, h:Int = 0, m:Int = 0, s:Int = 0, ss:Int = 0) =
    new DateTime()
      .withZone(DateTimeZone.UTC)
      .withYear(y)
      .withMonthOfYear(M)
      .withDayOfMonth(d)
      .withHourOfDay(h)
      .withMinuteOfHour(m)
      .withSecondOfMinute(s)
      .withMillisOfSecond(ss)

  it("should cope with full date formats") {
    ImageMetadataConverter.parseRandomDate("2001-02-03T04:05:06.007Z") should be(Some(day(2001, 2, 3, 4, 5, 6, 7)))
  }
  it("should cope with offset with space date formats") {
    ImageMetadataConverter.parseRandomDate("2001-02-03T04:05:06 +00:00") should be (Some(day(2001, 2, 3, 4, 5, 6)))
  }
  it("should cope with offset without space date formats") {
    ImageMetadataConverter.parseRandomDate("2001-02-03T04:05:06+00:00") should be (Some(day(2001, 2, 3, 4, 5, 6)))
  }
  it("should cope with no offset date formats") {
    ImageMetadataConverter.parseRandomDate("2001-02-03T04:05:06") should be (Some(day(2001, 2, 3, 4, 5, 6)))
  }
  it("should cope with nbo offset, no millis date formats") {
    ImageMetadataConverter.parseRandomDate("2001-02-03T04:05:06.007") should be (Some(day(2001, 2, 3, 4, 5, 6, 7)))
  }
  it("should cope with long seconds date formats") {
    ImageMetadataConverter.parseRandomDate("2001-02-03T04:05.006+00:00") should be (Some(day(2001, 2, 3, 4, 5, 0, 6)))
  }
  it("should cope with no seconds date formats") {
    ImageMetadataConverter.parseRandomDate("2001-02-03T04:05+00:00") should be (Some(day(2001, 2, 3, 4, 5)))
  }
  it("should cope with full, textual zone, date formats") {
    ImageMetadataConverter.parseRandomDate("Sat Feb 03 04:05:06.007 UTC 2001") should be (Some(day(2001, 2, 3, 4, 5, 6, 7)))
  }
  it("should cope with full, textual zone, no millis date formats") {
    ImageMetadataConverter.parseRandomDate("Sat Feb 03 04:05:06 UTC 2001") should be (Some(day(2001, 2, 3, 4, 5, 6)))
  }
  it("should cope with full, textual zone, non-UTC date formats") {
    ImageMetadataConverter.parseRandomDate("Tue Jul 03 04:05:06.007 BST 2001") should be (Some(day(2001, 7, 3, 3, 5, 6, 7)))
  }
  it("should cope with full, textual zone, non-UTC, no millis expected date formats") {
    ImageMetadataConverter.parseRandomDate("Tue Jul 03 04:05:06 BST 2001") should be (Some(day(2001, 7, 3, 3, 5, 6)))
  }
  it("should cope with just year date formats") {
    ImageMetadataConverter.parseRandomDate("2001") should be (Some(day(2001)))
  }
  it("should cope with year, dash, month date formats") {
    ImageMetadataConverter.parseRandomDate("2001-02") should be (Some(day(2001, 2)))
  }
  it("should cope with year month day date formats") {
    ImageMetadataConverter.parseRandomDate("20010203") should be (Some(day(2001, 2, 3)))
  }
  it("should cope with US-style year day month date formats") {
    ImageMetadataConverter.parseRandomDate("20012802") should be (Some(day(2001, 2, 28)))
  }
  it("should cope with year month date formats") {
    ImageMetadataConverter.parseRandomDate("20012") should be (Some(day(2001, 2)))
  }
  it("should cope with year dash month dash day date formats") {
    ImageMetadataConverter.parseRandomDate("2001-02-03") should be (Some(day(2001, 2, 3)))
  }
  it("should cope with invalid dates and return None") {
    ImageMetadataConverter.parseRandomDate("2000-02-31") should be(None)
  }

  it("should refuse future dates, if a 'maximum' date is provided which is before the image date") {
    val yesterday = ImageMetadataConverter.parseRandomDate("2020-12-31").get
    val parsedDate = ImageMetadataConverter.parseRandomDate("2021-01-01", Some(yesterday))
    parsedDate.isDefined should be (false)
  }

  it("should accept past dates, if a 'maximum' date is provided which is after the image date") {
    val tomorrow = ImageMetadataConverter.parseRandomDate("2021-01-01").get
    val parsedDate = ImageMetadataConverter.parseRandomDate("2020-12-31", Some(tomorrow))
    parsedDate.isDefined should be (true)
  }
}
