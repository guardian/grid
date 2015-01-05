package lib.imaging

import org.joda.time.{DateTime, DateTimeZone}
import org.joda.time.format._

import scala.util.Try

object ImageMetadata {

  def fromFileMetadata(fileMetadata: FileMetadata): ImageMetadata =
    ImageMetadata(
      dateTaken           = (fileMetadata.iptc.get("Date Created") flatMap parseRandomDate) orElse
                            (fileMetadata.exifSub.get("Date/Time Original") flatMap parseColonDate),
      description         = fileMetadata.iptc.get("Caption/Abstract"),
      credit              = fileMetadata.iptc.get("Credit"),
      byline              = fileMetadata.iptc.get("By-line"),
      bylineTitle         = fileMetadata.iptc.get("By-line Title"),
      title               = fileMetadata.iptc.get("Headline"),
      copyrightNotice     = fileMetadata.iptc.get("Copyright Notice"),
      // FIXME: why default to copyrightNotice again?
      copyright           = fileMetadata.exif.get("Copyright") orElse fileMetadata.iptc.get("Copyright Notice"),
      suppliersReference  = fileMetadata.iptc.get("Original Transmission Reference") orElse fileMetadata.iptc.get("Object Name"),
      source              = fileMetadata.iptc.get("Source"),
      specialInstructions = fileMetadata.iptc.get("Special Instructions"),
      keywords            = fileMetadata.iptc.get("Keywords") map (_.split(Array(';', ',')).map(_.trim).toList) getOrElse Nil,
      subLocation         = fileMetadata.iptc.get("Sub-location"),
      city                = fileMetadata.iptc.get("City"),
      province            = fileMetadata.iptc.get("Province/State"),
      country             = fileMetadata.iptc.get("Country/Primary Location Name")
    )


  // Note: because no timezone is given, we have to assume UTC :-(
  lazy val colonDateFormat = DateTimeFormat.forPattern("yyyy:MM:dd HH:mm:ss")
  def parseColonDate(str: String): Option[DateTime] =
    safeParsing(colonDateFormat.parseDateTime(str))

  // IPTC doesn't appear to enforce the datetime format of the field, which means we have to
  // optimistically attempt various formats observed in the wild. Dire times.
  lazy val randomDateFormat = {
    val parsers = Array(
      // 2014-12-16T02:23:45+01:00 - Standard dateTimeNoMillis
      DateTimeFormat.forPattern("yyyy-MM-dd'T'HH:mm:ssZZ").getParser,
      // 2014-12-16T02:23+01:00 - Same as above but missing seconds lol
      DateTimeFormat.forPattern("yyyy-MM-dd'T'HH:mmZZ").getParser,
      // Tue Dec 16 01:23:45 GMT 2014 - Let's make machine metadata human readable!
      DateTimeFormat.forPattern("E MMM d HH:mm:ss z yyyy").getParser,
      //      DateTimeFormat.forPattern("E MMM d HH:mm:ss 'BST' yyyy").getParser,
      // 2014-12-16 - Maybe it's just a date
      ISODateTimeFormat.date.getParser
    )
    new DateTimeFormatterBuilder().
      append(null, parsers).
      toFormatter
  }

  lazy val bstHumanDateFormat = DateTimeFormat.forPattern("E MMM d HH:mm:ss 'BST' yyyy")
  def parseBstHumanDate(str: String) =
  // Emulate BST by taking 1 hour from UTC
    safeParsing(bstHumanDateFormat.parseDateTime(str)) map (_.minusHours(1))

  def parseRandomDate(str: String): Option[DateTime] =
    safeParsing(randomDateFormat.parseDateTime(str)) orElse parseRandomDate(str) map (_.withZone(DateTimeZone.UTC))


  def safeParsing[A](parse: => A): Option[A] = Try(parse).toOption

}

// TODO: add category
// TODO: add Supplemental Category(s)
//       https://www.iptc.org/std/photometadata/documentation/GenericGuidelines/index.htm#!Documents/guidelineformappingcategorycodestosubjectnewscodes.htm
//       http://www.shutterpoint.com/Help-iptc.cfm#IC
// TODO: add Subject Reference?
//       http://cv.iptc.org/newscodes/subjectcode/
// TODO: add Coded Character Set ?
// TODO: add Application Record Version ?
case class ImageMetadata(
  dateTaken:           Option[DateTime],
  description:         Option[String],
  credit:              Option[String],
  byline:              Option[String],
  bylineTitle:         Option[String],
  title:               Option[String],
  copyrightNotice:     Option[String],
  copyright:           Option[String],
  suppliersReference:  Option[String],
  source:              Option[String],
  specialInstructions: Option[String],
  keywords:            List[String],
  subLocation:         Option[String], // FIXME: or place?
  city:                Option[String],
  province:            Option[String], // FIXME: or state?
  country:             Option[String]
)
