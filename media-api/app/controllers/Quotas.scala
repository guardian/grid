package controllers

import lib.{Config, QuotaStore, UsageQuota, UsageStore}

object Quotas extends UsageQuota {
    val quotaStore = new QuotaStore(
      Config.quotaStoreConfig.storeKey,
      Config.quotaStoreConfig.storeBucket,
      Config.awsCredentials
    )

    val usageStore = new UsageStore(
      Config.usageMailBucket,
      Config.awsCredentials,
      quotaStore
    )
}

