package com.gu.mediaservice.lib.metadata

import com.gu.mediaservice.model.FileMetadata.StringOrStrings
import org.joda.time.{DateTime, DateTimeZone}
import org.joda.time.format._

import scala.util.Try
import com.gu.mediaservice.model.{FileMetadata, ImageMetadata}
import play.api.Logger

object ImageMetadataConverter {

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

  def fromFileMetadata(fileMetadata: FileMetadata): ImageMetadata = {
    def readProperty(name: String, genericMap: Map[String, StringOrStrings]): Option[String] = {
      genericMap.get(name).map(prop => {
        prop match {
          case scala.Left(v) => v
          case scala.Right(v) => v.head
        }
      })
    }

    def readXmpProp(name: String) = readProperty(name, fileMetadata.xmp)


    //    def readProperty(name: String, genericMap: Map[String, StringOrStrings]): Option[String] = {
//      genericMap.get(name).map(prop => {
//        prop match {
//          case StringsVal(v) => v.head
//          case StringVal(v) => v
//        }
//      })
//    }

    val t: Option[DateTime] = fileMetadata.exifSub.get("Date/Time Original Composite").flatMap(x => parseRandomDate(x))
    ImageMetadata(
      dateTaken           = (fileMetadata.exifSub.get("Date/Time Original Composite") flatMap parseRandomDate) orElse
                            (fileMetadata.iptc.get("Date Time Created Composite") flatMap parseRandomDate) orElse
                            (readXmpProp("photoshop:DateCreated") flatMap parseRandomDate),
      description         = readXmpProp("dc:description[1]") orElse
                            fileMetadata.iptc.get("Caption/Abstract") orElse
                            fileMetadata.exif.get("Image Description"),
      credit              = readXmpProp("photoshop:Credit") orElse
                            fileMetadata.iptc.get("Credit"),
      // FIXME: Have a way of dealing with arrays, like [1] here.
      byline              = readXmpProp("dc:creator[1]") orElse
                            fileMetadata.iptc.get("By-line") orElse
                            fileMetadata.exif.get("Artist"),
      bylineTitle         = readXmpProp("photoshop:AuthorsPosition") orElse
                            fileMetadata.iptc.get("By-line Title"),
      title               = readXmpProp("photoshop:Headline") orElse
                            fileMetadata.iptc.get("Headline"),
      copyrightNotice     = readXmpProp("dc:Rights") orElse
                            fileMetadata.iptc.get("Copyright Notice"),
      // FIXME: our copyright and copyrightNotice fields should be one field (they read from equivalent fields).
      copyright           = fileMetadata.exif.get("Copyright") orElse
                            fileMetadata.iptc.get("Copyright Notice"),
      // Here we combine two separate fields, based on bad habits of our suppliers.
      suppliersReference  = readXmpProp("photoshop:TransmissionReference") orElse
                            fileMetadata.iptc.get("Original Transmission Reference") orElse
                            readXmpProp("dc:title[1]") orElse
                            fileMetadata.iptc.get("Object Name"),
      source              = readXmpProp("photoshop:Source") orElse
                            fileMetadata.iptc.get("Source"),
      specialInstructions = readXmpProp("photoshop:Instructions") orElse
                            fileMetadata.iptc.get("Special Instructions"),
      // FIXME: Read XMP dc:subject array:
      keywords            = fileMetadata.iptc.get("Keywords") map (_.split(Array(';', ',')).distinct.map(_.trim).toList) getOrElse Nil,
      // FIXME: Parse newest location schema: http://www.iptc.org/std/photometadata/specification/IPTC-PhotoMetadata#location-structure
      subLocation         = readXmpProp("Iptc4xmpCore:Location") orElse
                            fileMetadata.iptc.get("Sub-location"),
      city                = readXmpProp("photoshop:City") orElse
                            fileMetadata.iptc.get("City"),
      state               = readXmpProp("photoshop:State") orElse
                            fileMetadata.iptc.get("Province/State"),
      country             = readXmpProp("photoshop:Country") orElse
                            fileMetadata.iptc.get("Country/Primary Location Name"),
      subjects            = extractSubjects(fileMetadata))
  }

  // IPTC doesn't appear to enforce the datetime format of the field, which means we have to
  // optimistically attempt various formats observed in the wild. Dire times.
  private lazy val dateTimeFormatters: List[DateTimeFormatter] = List(
    // 2014-12-16T02:23:45+01:00 - Standard dateTimeNoMillis
    DateTimeFormat.forPattern("yyyy-MM-dd'T'HH:mm:ss.SSSZZ"),
    DateTimeFormat.forPattern("yyyy-MM-dd'T'HH:mm:ss' 'ZZ"),
    DateTimeFormat.forPattern("yyyy-MM-dd'T'HH:mm:ssZZ"),

    // no timezone provided so force UTC rather than use the machine's timezone
    DateTimeFormat.forPattern("yyyy-MM-dd'T'HH:mm:ss").withZoneUTC,
    DateTimeFormat.forPattern("yyyy-MM-dd'T'HH:mm:ss.SSS").withZoneUTC,

    // 2014-12-16T02:23+01:00 - Same as above but missing seconds lol
    DateTimeFormat.forPattern("yyyy-MM-dd'T'HH:mm.SSSZZ"),
    DateTimeFormat.forPattern("yyyy-MM-dd'T'HH:mmZZ"),
    // Tue Dec 16 01:23:45 GMT 2014 - Let's make machine metadata human readable!
    DateTimeFormat.forPattern("E MMM dd HH:mm:ss.SSS z yyyy"),
    DateTimeFormat.forPattern("E MMM dd HH:mm:ss z yyyy"),

    /*
      `BST` can be:
        - British Summer Time
        - Bangladesh Standard Time
        - Bougainville Standard Time
      See https://24timezones.com/time-zone/bst
      Be ignorant and assume British Summer Time because we're Europe centric
     */
    DateTimeFormat.forPattern("E MMM dd HH:mm:ss.SSS 'BST' yyyy").withZone(DateTimeZone.forOffsetHours(1)),
    DateTimeFormat.forPattern("E MMM dd HH:mm:ss 'BST' yyyy").withZone(DateTimeZone.forOffsetHours(1)),


    // 2014-12-16 - Maybe it's just a date
    // no timezone provided so force UTC rather than use the machine's timezone
    ISODateTimeFormat.date.withZoneUTC
  )

  private def parseRandomDate(str: String): Option[DateTime] =
    dateTimeFormatters.foldLeft[Option[DateTime]](None){
      case (successfulDate@Some(_), _) => successfulDate
      case (None, formatter) => safeParsing(formatter.parseDateTime(str))
    }.map(_.withZone(DateTimeZone.UTC))

  private def safeParsing[A](parse: => A): Option[A] = Try(parse).toOption

  private def cleanDateFormat = ISODateTimeFormat.dateTime
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
