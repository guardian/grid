package controllers

import lib.{Config, UsageQuota}
import com.gu.mediaservice.lib.usage.{UsageStore, QuotaStore}

object Quotas extends UsageQuota {
    val supplierConfig = Config.quotaConfig

    val quotaStore = Config.quotaStoreConfig.map(c => {
      new QuotaStore(
        c.storeKey,
        c.storeBucket,
        Config.awsCredentials
      )
    })

    val usageStore = Config.usageStoreConfig.map(c => {
      new UsageStore(
        c.storeKey,
        c.storeBucket,
        Config.awsCredentials,
        quotaStore.getOrElse(
          throw new RuntimeException("Invalid quota store config!"))
      )
    })
}

