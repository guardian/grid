package controllers

import lib.{Config, QuotaStore, UsageQuota, UsageStore}

object Quotas extends UsageQuota {
    val quotaStore = Config.quotaStoreConfig.map(c => {
      new QuotaStore(
        c.storeKey,
        c.storeBucket,
        Config.awsCredentials
      )
    })

    val usageStore = new UsageStore(
      Config.usageMailBucket,
      Config.awsCredentials,
      quotaStore.getOrElse(
        throw new RuntimeException("Invalid quota store config!"))
    )
}

