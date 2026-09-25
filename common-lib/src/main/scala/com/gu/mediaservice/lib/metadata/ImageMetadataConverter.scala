package com.gu.mediaservice.lib.metadata

import com.gu.mediaservice.lib.logging.GridLogging
import org.joda.time.{DateTime, DateTimeZone}
import org.joda.time.format._

import scala.util.Try
import com.gu.mediaservice.model.{FileMetadata, ImageMetadata}
import play.api.libs.json.{JsArray, JsString, JsValue}

object ImageMetadataConverter extends GridLogging {

  // keep positive years (ie AD) with a couple of days spare room to avoid accidentally flipping over into BC
  val earliestSensibleDate: DateTime = DateTime.parse("0001-01-03T00:00:00.000Z")
  // offset hours representing possible range of + timezones ahead of UTC
  private val utcHoursOffset: Int = 14

  private def extractSubjects(fileMetadata: FileMetadata): Option[List[String]] = {
    val supplementalCategories = fileMetadata.iptc
      .get("Supplemental Category(s)")
      .toList.flatMap(_.split("\\s+"))

    val category = fileMetadata.iptc
      .get("Category")

    Some((supplementalCategories ::: category.toList)
      .flatMap(Subject.create)
      .map(_.toString)
      .distinct)
  }

  private def extractXMPArrayStrings(field: String, fileMetadata: FileMetadata): Seq[String] = fileMetadata.xmp.get(field) match {
    case Some(JsArray(items)) => items.toList.flatMap {
      case JsString(value) => Some(value)
      case _ => None
    }
    case Some(value) => List(value.toString)
    case _ => List()
  }

  private def extractPeople(fileMetadata: FileMetadata): Option[Set[String]] = {
    val xmpIptcPeople = extractXMPArrayStrings("Iptc4xmpExt:PersonInImage", fileMetadata)
    val xmpGettyPeople = extractXMPArrayStrings("GettyImagesGIFT:Personality", fileMetadata)
    Some((xmpIptcPeople ++ xmpGettyPeople).toSet)
  }

  private def extractKeywords(fileMetadata: FileMetadata): Option[Set[String]] = {
    val fromXMP  = extractXMPArrayStrings("dc:subject", fileMetadata).toSet
    val fromIPTC = fileMetadata.iptc.get("Keywords") map (_.split(Array(';', ',')).distinct.map(_.trim).toSet) getOrElse Set.empty
    Some((fromXMP, fromIPTC) match {
      case (xmp, _)  if xmp.nonEmpty  => xmp
      case (_, iptc) if iptc.nonEmpty => iptc
      case _ => Set.empty
    })
  }

  def fromFileMetadata(fileMetadata: FileMetadata, latestAllowedDateTime: Option[DateTime] = None, earliestAllowedDateTime: Option[DateTime] = Some(earliestSensibleDate)): ImageMetadata = {
    def parseDate(dateString: String): Option[DateTime] = parseRandomDate(dateString, maxDate = latestAllowedDateTime, minDate = earliestAllowedDateTime)

    // setting of taken date
    val exifTaken: Option[String] = fileMetadata.exifSub.get("Date/Time Original Composite")
    val iptcTaken: Option[String] = fileMetadata.iptc.get("Date Time Created Composite")
    val xmpTaken: Option[String] = fileMetadata.readXmpHeadStringProp("photoshop:DateCreated")
    val iptcDate: Option[String] = fileMetadata.iptc.get("Date Created")
    val dateTaken: Option[DateTime] = exifTaken.flatMap(parseDate) orElse
                                      iptcTaken.flatMap(parseDate) orElse
                                      xmpTaken.flatMap(parseDate) orElse
                                      iptcDate.flatMap(parseDate)

    ImageMetadata(
      dateTaken           = dateTaken,
      description         = fileMetadata.readXmpHeadStringProp("dc:description") orElse
                            fileMetadata.iptc.get("Caption/Abstract") orElse
                            fileMetadata.exif.get("Image Description"),
      credit              = fileMetadata.readXmpHeadStringProp("photoshop:Credit") orElse
                            fileMetadata.iptc.get("Credit"),
      byline              = fileMetadata.readXmpHeadStringProp("dc:creator") orElse
                            fileMetadata.iptc.get("By-line") orElse
                            fileMetadata.exif.get("Artist"),
      bylineTitle         = fileMetadata.readXmpHeadStringProp("photoshop:AuthorsPosition") orElse
                            fileMetadata.iptc.get("By-line Title"),
      title               = fileMetadata.readXmpHeadStringProp("photoshop:Headline") orElse
                            fileMetadata.iptc.get("Headline"),
      copyright           = fileMetadata.readXmpHeadStringProp("dc:Rights") orElse
                            fileMetadata.iptc.get("Copyright Notice") orElse
                            fileMetadata.exif.get("Copyright"),
      // Here we combine two separate fields, based on bad habits of our suppliers.
      // see https://github.com/guardian/grid/pull/3328#issuecomment-849080100
      suppliersReference  = fileMetadata.readXmpHeadStringProp("photoshop:TransmissionReference") orElse
                            fileMetadata.iptc.get("Original Transmission Reference") orElse
                            fileMetadata.readXmpHeadStringProp("dc:title") orElse
                            fileMetadata.iptc.get("Object Name"),
      source              = fileMetadata.readXmpHeadStringProp("photoshop:Source") orElse
                            fileMetadata.iptc.get("Source"),
      specialInstructions = fileMetadata.readXmpHeadStringProp("photoshop:Instructions") orElse
                            fileMetadata.iptc.get("Special Instructions"),
      keywords            = extractKeywords(fileMetadata),
      // FIXME: Parse newest location schema: http://www.iptc.org/std/photometadata/specification/IPTC-PhotoMetadata#location-structure
      subLocation         = fileMetadata.readXmpHeadStringProp("Iptc4xmpCore:Location") orElse
                            fileMetadata.iptc.get("Sub-location"),
      city                = fileMetadata.readXmpHeadStringProp("photoshop:City") orElse
                            fileMetadata.iptc.get("City"),
      state               = fileMetadata.readXmpHeadStringProp("photoshop:State") orElse
                            fileMetadata.iptc.get("Province/State"),
      // Countries are parsed in order from these fields, they are used if CountryCode cannot
      // identify a country from a country code in the fileMetadata.
      country             = fileMetadata.readXmpHeadStringProp("photoshop:Country") orElse
                            fileMetadata.iptc.get("Country/Primary Location Name") orElse
                            fileMetadata.readXmpHeadStringProp("Iptc4xmpCore:CountryCode") orElse
                            fileMetadata.iptc.get("Country/Primary Location Code"),
      subjects            = extractSubjects(fileMetadata),
      peopleInImage       = extractPeople(fileMetadata),
      imageType           = None // FIXME add extractor for imageType https://www.iptc.org/std/photometadata/specification/IPTC-PhotoMetadata#digital-source-type
    )
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

    // TODO these group of formatters are locale dependent. Is this intentional?
    DateTimeFormat.forPattern("yyyyMMdd"),
    DateTimeFormat.forPattern("yyyyMM"),
    DateTimeFormat.forPattern("yyyyddMM"),
    DateTimeFormat.forPattern("yyyy"),
    DateTimeFormat.forPattern("yyyy-MM"),
    DateTimeFormat.forPattern("yyyy:MM:dd"),

    // 2014-12-16 - Maybe it's just a date
    // no timezone provided so force UTC rather than use the machine's timezone
    ISODateTimeFormat.date.withZoneUTC
  )

  private[metadata] def parseRandomDate(str: String, maxDate: Option[DateTime] = None, minDate: Option[DateTime] = None): Option[DateTime] = {
    // account for images sent with local timezone info being interpreted as UTC
    val feasibleMaxDate: Option[DateTime] = maxDate.map(_.plusHours(utcHoursOffset))
    dateTimeFormatters.foldLeft[Option[DateTime]](None){
      case (successfulDate@Some(_), _) => successfulDate
      // NB We refuse parse results which result in future dates, if a max date is provided.
      // eg If we get a pic today (22nd January 2021) with a date string of 20211201 we can be pretty sure
      // that it should be parsed as (eg) US (12th Jan 2021), not EU (1st Dec 2021).
      // So we refuse the (apparently successful) EU parse result.
      case (None, formatter) => safeParsing(formatter.parseDateTime(str))
        .filter(d => feasibleMaxDate.forall(d.isBefore) && minDate.forall(d.isAfter))
    }.map(_.withZone(DateTimeZone.UTC))
  }

  private def safeParsing[A](parse: => A): Option[A] = Try(parse).toOption

  private def cleanDateFormat = ISODateTimeFormat.dateTime
  def cleanDate(dirtyDate: String, fieldName: String = "none", imageId:String = "none"): String = {
    val slightlyCleanedDate = dirtyDate match {
      case d if d.length == 8 && d.endsWith("0000") => d.take(4) + "0101"
      case d if d.length == 8 && d.endsWith("00") => d.take(6) + "01"
      case d => d
    }
    parseRandomDate(slightlyCleanedDate) match {
      case Some(cleanDate) =>
        cleanDateFormat.print(cleanDate)
      case None => {
        logger.info(s"Unable to parse date $dirtyDate from field $fieldName for image $imageId")
        dirtyDate
      }
    }
  }

}

// TODO: add Supplemental Category(s)
//       https://www.iptc.org/std/photometadata/documentation/GenericGuidelines/index.htm#!Documents/guidelineformappingcategorycodestosubjectnewscodes.htm
//       http://www.shutterpoint.com/Help-iptc.cfm#IC
// TODO: add Subject Reference?
//       http://cv.iptc.org/newscodes/subjectcode/
// TODO: add Coded Character Set ?
