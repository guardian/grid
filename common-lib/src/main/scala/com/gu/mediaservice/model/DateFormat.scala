package com.gu.mediaservice.model

import org.joda.time.DateTime
import org.joda.time.format.ISODateTimeFormat
import play.api.libs.json._
import play.api.data.validation.ValidationError


object DateFormat extends Format[DateTime] {
  def writes(d: DateTime): JsValue = JsString(d.toString())
  def reads(json: JsValue): JsResult[DateTime] = {
    json.validate[String].flatMap { dt =>
      try { JsSuccess(ISODateTimeFormat.dateTimeParser().parseDateTime(dt)) }
      catch { case e: IllegalArgumentException =>
        JsError(ValidationError("validate.error.expected.date.isoformat",dt))
      }
    }
  }
}
