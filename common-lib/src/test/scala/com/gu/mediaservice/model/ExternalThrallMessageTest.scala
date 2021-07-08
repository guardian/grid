package com.gu.mediaservice.model

import com.gu.mediaservice.model.leases.MediaLease
import com.gu.mediaservice.model.usage.UsageNotice
import org.joda.time.{DateTime, DateTimeZone}
import org.scalatest.prop.{Checkers, PropertyChecks}
import org.scalatest.{FreeSpec, Matchers}
import play.api.libs.json.{JsArray, JsSuccess, Json}

class ExternalThrallMessageTest extends FreeSpec with Matchers with Checkers with PropertyChecks {
  //This doesn't test any message contents as we assume they have their own checks.
  val now = DateTime.now(DateTimeZone.forOffsetHours(9))
  val nowUtc = new DateTime(now.getMillis()).toDateTime(DateTimeZone.UTC)

  def roundTrip(m: ExternalThrallMessage) = {
    val json = m.toJson
    val string = Json.stringify(json)
    val parsed = Json.parse(string)
    val reformed = parsed.validate[ExternalThrallMessage](Json.reads[ExternalThrallMessage])
    reformed should equal(JsSuccess(m))
  }

  "Make some JSON" - {
    "from an imageMessage" in {
      val image = ImageTest.createImage("hello")
      val message = ImageMessage(nowUtc, image.copy(uploadTime = nowUtc))
      //Manually set the image time, because the time zone data is lost in
      //conversion
      roundTrip(message)
    }
    "from a DeleteImageMessage" in {
      val dim = DeleteImageMessage("hey", nowUtc)
      roundTrip(dim)
    }
    "from a DeleteImageExportsMessage" in {
      val diem = DeleteImageExportsMessage("carpe", nowUtc)
      roundTrip(diem)
    }
    "from a UpdateImageExportsMessage" in {
      val uiem = UpdateImageExportsMessage("id", nowUtc, Seq())
      roundTrip(uiem)
    }

    "from a UpdateImageUserMetadataMessage" in {
      val msg = UpdateImageUserMetadataMessage("hello", nowUtc, Edits(metadata = ImageMetadata()))
      roundTrip(msg)
    }
    "from a UpdateImageUsagesMessage" in {
      val msg = UpdateImageUsagesMessage("hello", nowUtc, UsageNotice("hello", JsArray()))
      roundTrip(msg)
    }
    "from a ReplaceImageLeasesMessage" in {
      val msg = ReplaceImageLeasesMessage("hello", nowUtc, Seq())
      roundTrip(msg)
    }

    "from a AddImageLeaseMessage" in {
      val msg = AddImageLeaseMessage("hello", nowUtc, MediaLease(None, None, notes = None, mediaId = ""))
      roundTrip(msg)
    }
    "from a RemoveImageLeaseMessage" in {
      val msg = RemoveImageLeaseMessage("hello", nowUtc, "bye")
      roundTrip(msg)
    }
    "from a SetImageCollectionsMessage" in {
      val msg = SetImageCollectionsMessage("hello", nowUtc, Seq())
      roundTrip(msg)
    }
    "from a DeleteUsagesMessage" in {
      val msg = DeleteUsagesMessage("hello", nowUtc)
      roundTrip(msg)
    }
    "from a UpdateImageSyndicationMetadataMessage" in {
      val msg = UpdateImageSyndicationMetadataMessage("hello", nowUtc, None)
      roundTrip(msg)
    }
    "from a UpdateImagePhotoshootMetadataMessage" in {
      val msg = UpdateImagePhotoshootMetadataMessage("hello", nowUtc, Edits(metadata = ImageMetadata()))
      roundTrip(msg)
    }
  }
}
