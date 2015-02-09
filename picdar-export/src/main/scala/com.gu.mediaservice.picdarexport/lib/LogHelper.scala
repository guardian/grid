package com.gu.mediaservice.picdarexport.lib

import org.joda.time.DateTime
import play.api.Logger

trait LogHelper {

  def logDuration[A](name: String)(func: => A) = {
    Logger.info(s"$name started")
    val start = new DateTime
    try func
    finally {
      val end = new DateTime
      val duration = end.getMillis - start.getMillis
      Logger.info(s"$name ran in $duration ms")
    }
  }

}
