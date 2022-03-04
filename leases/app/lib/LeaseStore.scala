package lib

import com.gu.mediaservice.lib.aws.DynamoDB
import com.gu.mediaservice.model.leases.{MediaLease, MediaLeaseType}
import org.scanamo._
import org.scanamo.syntax._
import org.joda.time.DateTime
import org.scanamo.auto.genericProduct

import scala.concurrent.ExecutionContext

class LeaseStore(config: LeasesConfig) extends DynamoDB(config, config.leasesTable) {
  implicit val dateTimeFormat =
    DynamoFormat.coercedXmap[DateTime, String, IllegalArgumentException](DateTime.parse)(_.toString)
  implicit val enumFormat =
    DynamoFormat.coercedXmap[MediaLeaseType, String, IllegalArgumentException](MediaLeaseType(_))(_.toString)

  private val leasesTable = Table[MediaLease](config.leasesTable)
  // FIXME use scanamo async
  private val scanamo = Scanamo(client)

  def get(id: String): Option[MediaLease] = {
    scanamo.exec(leasesTable.get("id" -> id)).flatMap(_.toOption)
  }

  def getForMedia(id: String): List[MediaLease] = {
    scanamo.exec(leasesTable.index("mediaId").query("mediaId" -> id)).flatMap(_.toOption)
  }

  def put(lease: MediaLease)(implicit ec: ExecutionContext) = {
    ScanamoAsync(client).exec(leasesTable.put(lease))
  }

  def putAll(leases: List[MediaLease])(implicit ec: ExecutionContext) = {
    ScanamoAsync(client).exec(leasesTable.putAll(leases.toSet))
  }

  def delete(id: String)(implicit ec: ExecutionContext) = {
    ScanamoAsync(client).exec(leasesTable.delete("id" -> id))
  }

  def forEach(run: List[MediaLease] => Unit)(implicit ec: ExecutionContext) = ScanamoAsync(client).exec(
    leasesTable.scan
      .map(ops => ops.flatMap(_.toOption))
      .map(run)
  )
}
