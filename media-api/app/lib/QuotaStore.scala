package lib

import com.gu.mediaservice.lib.BaseStore
import play.api.libs.json.Json

import scala.concurrent.ExecutionContext

class QuotaStore(
                  quotaFile: String,
                  bucket: String,
                  config: MediaApiConfig,
                  val s3Endpoint: String,
                )(implicit ec: ExecutionContext) extends BaseStore[String, SupplierUsageQuota](bucket, config, s3Endpoint)(ec) {

  def getQuota: Map[String, SupplierUsageQuota] = store.get()

  def update(): Unit = {
    store.set(fetchQuota)
  }

  private def fetchQuota: Map[String, SupplierUsageQuota] = {
    val quotaFileString = getS3Object(quotaFile).get
    logger.info("Fetched quota file: " + quotaFileString)

    val summary: Seq[SupplierUsageQuota] = Json
      .parse(quotaFileString)
      .as[List[SupplierUsageQuota]]

    val quotas = summary.foldLeft(Map[String, SupplierUsageQuota]())((memo, quota) => {
      memo + (quota.agency.supplier -> quota)
    })
    logger.info("Got quotas: " + quotas)
    quotas
  }
}
