package lib

import com.gu.mediaservice.lib.aws.DynamoDB
import com.gu.mediaservice.model.{MediaLease, MediaLeaseType}
import com.gu.scanamo._
import com.gu.scanamo.syntax._
import org.joda.time.DateTime

import scala.concurrent.ExecutionContext

class LeaseStore(config: LeasesConfig) extends DynamoDB(config, config.leasesTable) {
  implicit val dateTimeFormat =
    DynamoFormat.coercedXmap[DateTime, String, IllegalArgumentException](DateTime.parse)(_.toString)
  implicit val enumFormat =
    DynamoFormat.coercedXmap[MediaLeaseType, String, IllegalArgumentException](MediaLeaseType(_))(_.toString)

  private val leasesTable = Table[MediaLease](config.leasesTable)

  def get(id: String): Option[MediaLease] = {
    Scanamo.exec(client)(leasesTable.get('id -> id)).flatMap(_.toOption)
  }

  def getForMedia(id: String): List[MediaLease] = {
    Scanamo.exec(client)(leasesTable.index("mediaId").query('mediaId -> id)).flatMap(_.toOption)
  }

  def put(lease: MediaLease)(implicit ec: ExecutionContext) = {
    ScanamoAsync.exec(client)(leasesTable.put(lease))
  }

  def delete(id: String)(implicit ec: ExecutionContext) = {
    ScanamoAsync.exec(client)(leasesTable.delete('id -> id))
  }

  def forEach(run: List[MediaLease] => Unit)(implicit ec: ExecutionContext) = ScanamoAsync.exec(client)(
    leasesTable.scan
      .map(ops => ops.flatMap(_.toOption))
      .map(run)
  )
}
