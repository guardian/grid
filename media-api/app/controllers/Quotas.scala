package controllers

import lib.{Config, UsageQuota}

object Quotas extends UsageQuota {
    val supplierConfig = Config.quotaConfig
}

