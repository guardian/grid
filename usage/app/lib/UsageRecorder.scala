package lib

import model._


object UsageRecorder {
  val usageStream = UsageStream.observable

  val observable = usageStream.map((usageGroup: UsageGroup) =>
    println(usageGroup)
  )
}
