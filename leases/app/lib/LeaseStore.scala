package lib

import java.util.UUID

import com.gu.mediaservice.lib.aws.DynamoDB
import com.gu.mediaservice.model.{MediaLease, MediaLeaseType}
import com.gu.scanamo._
import com.gu.scanamo.syntax._
import org.joda.time.DateTime

import scala.concurrent.ExecutionContext.Implicits.global
import scala.concurrent.Future

class LeaseStore(config: LeasesConfig) extends DynamoDB(config, config.leasesTable) {
  implicit val dateTimeFormat =
    DynamoFormat.coercedXmap[DateTime, String, IllegalArgumentException](DateTime.parse)(_.toString)
  implicit val enumFormat =
    DynamoFormat.coercedXmap[MediaLeaseType, String, IllegalArgumentException](MediaLeaseType(_))(_.toString)

  private val tableName = config.leasesTable

  def get(id: String): Option[MediaLease] = Scanamo.get[MediaLease](client)(tableName)('id -> id).flatMap(_.toOption)
  def getForMedia(id: String): List[MediaLease] = Scanamo.queryIndex[MediaLease](client)(tableName, "mediaId")('mediaId -> id).flatMap(_.toOption)

  def put(lease: MediaLease): Future[Unit] =
    ScanamoAsync.put[MediaLease](client)(tableName)(lease.copy(id=Some(UUID.randomUUID().toString))).mapTo[Unit]
  def delete(id: String) = ScanamoAsync.delete(client)(tableName)('id -> id)

  def forEach(run: List[MediaLease] => Unit) = ScanamoAsync.exec(client)(
    Table[MediaLease](tableName).scan
      .map(ops => ops.flatMap(_.toOption))
      .map(run)
  )
}
