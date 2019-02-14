package lib

import org.joda.time.DateTime

trait MessageConsumerVersion {
  def lastProcessed: DateTime
  def isStopped: Boolean
}