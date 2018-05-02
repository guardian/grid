package controllers

import lib.{MediaApiConfig, QuotaStore, UsageStore}
import scala.concurrent.ExecutionContext.Implicits.global

class Quotas(config: MediaApiConfig) {
    val quotaStore = new QuotaStore(
      config.quotaStoreConfig.storeKey,
      config.quotaStoreConfig.storeBucket,
      config
    )

    val usageStore = new UsageStore(
      config.usageMailBucket,
      config,
      quotaStore
    )
}

