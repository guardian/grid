package com.gu.mediaservice.lib.metadata

import com.gu.mediaservice.lib.Logging
import org.joda.time.{DateTime, DateTimeZone}
import org.joda.time.format._

import scala.util.Try
import com.gu.mediaservice.model.{FileMetadata, ImageMetadata}

object ImageMetadataConverter extends Logging {

  private def extractSubjects(fileMetadata: FileMetadata): List[String] = {
    val supplementalCategories = fileMetadata.iptc
      .get("Supplemental Category(s)")
      .toList.flatMap(_.split("\\s+"))

    val category = fileMetadata.iptc
      .get("Category")

    (supplementalCategories ::: category.toList)
      .flatMap(Subject.create)
      .map(_.toString)
      .distinct
  }

  def fromFileMetadata(fileMetadata: FileMetadata): ImageMetadata =
    ImageMetadata(
      dateTaken           = (fileMetadata.exifSub.get("Date/Time Original Composite") flatMap parseRandomDate) orElse
                            (fileMetadata.iptc.get("Date Time Created Composite") flatMap parseRandomDate) orElse
                            (fileMetadata.xmp.get("photoshop:DateCreated") flatMap parseRandomDate),
      description         = fileMetadata.xmp.get("dc:description[1]") orElse
                            fileMetadata.iptc.get("Caption/Abstract") orElse
                            fileMetadata.exif.get("Image Description"),
      credit              = fileMetadata.xmp.get("photoshop:Credit") orElse
                            fileMetadata.iptc.get("Credit"),
      // FIXME: Have a way of dealing with arrays, like [1] here.
      byline              = fileMetadata.xmp.get("dc:creator[1]") orElse
                            fileMetadata.iptc.get("By-line") orElse
                            fileMetadata.exif.get("Artist"),
      bylineTitle         = fileMetadata.xmp.get("photoshop:AuthorsPosition") orElse
                            fileMetadata.iptc.get("By-line Title"),
      title               = fileMetadata.xmp.get("photoshop:Headline") orElse
                            fileMetadata.iptc.get("Headline"),
      copyrightNotice     = fileMetadata.xmp.get("dc:Rights") orElse
                            fileMetadata.iptc.get("Copyright Notice"),
      // FIXME: our copyright and copyrightNotice fields should be one field (they read from equivalent fields).
      copyright           = fileMetadata.exif.get("Copyright") orElse
                            fileMetadata.iptc.get("Copyright Notice"),
      // Here we combine two separate fields, based on bad habits of our suppliers.
      suppliersReference  = fileMetadata.xmp.get("photoshop:TransmissionReference") orElse
                            fileMetadata.iptc.get("Original Transmission Reference") orElse
                            fileMetadata.xmp.get("dc:title[1]") orElse
                            fileMetadata.iptc.get("Object Name"),
      source              = fileMetadata.xmp.get("photoshop:Source") orElse
                            fileMetadata.iptc.get("Source"),
      specialInstructions = fileMetadata.xmp.get("photoshop:Instructions") orElse
                            fileMetadata.iptc.get("Special Instructions"),
      // FIXME: Read XMP dc:subject array:
      keywords            = fileMetadata.iptc.get("Keywords") map (_.split(Array(';', ',')).distinct.map(_.trim).toList) getOrElse Nil,
      // FIXME: Parse newest location schema: http://www.iptc.org/std/photometadata/specification/IPTC-PhotoMetadata#location-structure
      subLocation         = fileMetadata.xmp.get("Iptc4xmpCore:Location") orElse
                            fileMetadata.iptc.get("Sub-location"),
      city                = fileMetadata.xmp.get("photoshop:City") orElse
                            fileMetadata.iptc.get("City"),
      state               = fileMetadata.xmp.get("photoshop:State") orElse
                            fileMetadata.iptc.get("Province/State"),
      country             = fileMetadata.xmp.get("photoshop:Country") orElse
                            fileMetadata.iptc.get("Country/Primary Location Name"),
      subjects            = extractSubjects(fileMetadata))

  // IPTC doesn't appear to enforce the datetime format of the field, which means we have to
  // optimistically attempt various formats observed in the wild. Dire times.
  private lazy val randomDateFormat = {
    val parsers = Array(
      // 2014-12-16T02:23:45+01:00 - Standard dateTimeNoMillis
      DateTimeFormat.forPattern("yyyy-MM-dd'T'HH:mm:ss.SSSZZ").getParser,
      DateTimeFormat.forPattern("yyyy-MM-dd'T'HH:mm:ss' 'ZZ").getParser,
      DateTimeFormat.forPattern("yyyy-MM-dd'T'HH:mm:ssZZ").getParser,
      DateTimeFormat.forPattern("yyyy-MM-dd'T'HH:mm:ss").getParser,
      DateTimeFormat.forPattern("yyyy-MM-dd'T'HH:mm:ss.SSS").getParser,
      // 2014-12-16T02:23+01:00 - Same as above but missing seconds lol
      DateTimeFormat.forPattern("yyyy-MM-dd'T'HH:mm.SSSZZ").getParser,
      DateTimeFormat.forPattern("yyyy-MM-dd'T'HH:mmZZ").getParser,
      // Tue Dec 16 01:23:45 GMT 2014 - Let's make machine metadata human readable!
      DateTimeFormat.forPattern("E MMM dd HH:mm:ss.SSS z yyyy").getParser,
      DateTimeFormat.forPattern("E MMM dd HH:mm:ss z yyyy").getParser,
      DateTimeFormat.forPattern("E MMM dd HH:mm:ss.SSS 'BST' yyyy").getParser,
      DateTimeFormat.forPattern("E MMM dd HH:mm:ss 'BST' yyyy").getParser,
      // 2014-12-16 - Maybe it's just a date
      ISODateTimeFormat.date.getParser
    )
    new DateTimeFormatterBuilder().
      append(null, parsers).
      toFormatter
  }

  private def parseRandomDate(str: String): Option[DateTime] =
    safeParsing(randomDateFormat.parseDateTime(str)) map (_.withZone(DateTimeZone.UTC))

  private def safeParsing[A](parse: => A): Option[A] = Try(parse).toOption

  private def cleanDateFormat = DateTimeFormat.forPattern("yyyy-MM-dd'T'HH:mm:ss.SSSZZ")
  def cleanDate(dirtyDate: String, fieldName: String = "none", imageId:String = "none"): String = parseRandomDate(dirtyDate) match {
    case Some(cleanDate) => cleanDateFormat.print(cleanDate)
    case None => {
      Logger.info(s"Unable to parse date $dirtyDate from field $fieldName for image $imageId")
      dirtyDate
    }
  }


}

// TODO: add Supplemental Category(s)
//       https://www.iptc.org/std/photometadata/documentation/GenericGuidelines/index.htm#!Documents/guidelineformappingcategorycodestosubjectnewscodes.htm
//       http://www.shutterpoint.com/Help-iptc.cfm#IC
// TODO: add Subject Reference?
//       http://cv.iptc.org/newscodes/subjectcode/
// TODO: add Coded Character Set ?
