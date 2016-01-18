package com.gu.mediaservice.picdarexport.model

import java.net.URI

import com.amazonaws.services.dynamodbv2.document.Item
import com.gu.mediaservice.model.{UsageRights, ImageMetadata}
import org.joda.time.format.DateTimeFormat
import org.joda.time.DateTime
import org.joda.time.Days


case class Asset(
  urn: String,
  file: URI,
  created: DateTime,
  modified: Option[DateTime],
  metadata: ImageMetadata,
  infoUri: Option[URI],
  usageRights: Option[UsageRights]
)

object PicdarDates {
  // It's really better not to ask.
  val dynamoDbFormat =  DateTimeFormat.forPattern("yyyy-MM-dd")
  val format =  DateTimeFormat.forPattern("yyyy/MM/dd")
  val longFormat = DateTimeFormat.forPattern("yyyyMMddHH:mm:ss")
  val usageApiShortDateFormat = DateTimeFormat.forPattern("dd/MM/yyyy")
  val usageApiLongDateFormat = DateTimeFormat.forPattern("dd/MM/yyyy-HH:mm:ss")
}

case class AssetRef(urn: String, dateLoaded: DateTime)
object AssetRef {

  def apply(item: Item): AssetRef =
    AssetRef(
      item.getString("picdarUrn"),
      PicdarDates.dynamoDbFormat.parseDateTime(item.getString("picdarCreated"))
    )
}


case class DateRange(start: Option[DateTime], end: Option[DateTime]) {
  val startDay = start.getOrElse(DateRange.defaultStartDate)
  val endDay   = end.getOrElse(DateRange.defaultEndDate)
  val numDays  = Days.daysBetween(startDay, endDay).getDays();
  val dateList = (0 to numDays).map(startDay.plusDays)
}
object DateRange {
  val defaultStartDate = PicdarDates.format.parseDateTime("1998/01/01")
  val defaultEndDate   = DateTime.now()

  val all = DateRange(None, None)
}
