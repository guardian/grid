package com.gu.mediaservice.lib.aws

import org.joda.time.{DateTime, Duration}

trait RoundedExpiration {

  // Round expiration time to try and hit the cache as much as possible
  // TODO: do we really need these expiration tokens? they kill our ability to cache...
  def cachableExpiration(after: DateTime = DateTime.now): DateTime = roundDateTime(after, Duration.standardMinutes(10)).plusMinutes(20)

  private def roundDateTime(t: DateTime, d: Duration): DateTime = t minus (t.getMillis - (t.getMillis.toDouble / d.getMillis).round * d.getMillis)

}
