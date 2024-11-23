package lib

import com.gu.mediaservice.lib.config.{CommonConfig, GridConfigResources}
import com.gu.mediaservice.lib.logging.GridLogging
import com.gu.mediaservice.lib.net.URI.ensureSecure
import com.gu.mediaservice.model.Instance

class UsageConfig(resources: GridConfigResources) extends CommonConfig(resources) with GridLogging {
  val usageUri: Instance => String = services.usageBaseUri
  val apiUri: Instance => String = services.apiBaseUri

  val defaultMaxPrintRequestSizeInKb = 500
  val defaultDateLimit = "2016-01-01T00:00:00+00:00"

  val maxPrintRequestLengthInKb: Int = intDefault("api.setPrint.maxLength", defaultMaxPrintRequestSizeInKb)

  val usageDateLimit: String = stringDefault("usage.dateLimit", defaultDateLimit)

  val usageRecordTable = string("dynamo.tablename.usageRecordTable")
}
