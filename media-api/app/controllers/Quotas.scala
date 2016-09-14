package controllers

import lib.{Config, UsageQuota}
import com.gu.mediaservice.lib.usage.UsageStore

object Quotas extends UsageQuota {
    val supplierConfig = Config.quotaConfig
    val usageStore = Config.usageStoreConfig.map(c => {
      new UsageStore(
        c.storeKey,
        c.storeBucket,
        Config.awsCredentials,
        supplierQuota
      )
    })
}

