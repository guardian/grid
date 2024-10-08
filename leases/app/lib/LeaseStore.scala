package lib

import com.gu.mediaservice.model.leases.{MediaLease, MediaLeaseType}
import org.scanamo._
import org.scanamo.syntax._
import org.scanamo.generic.auto._
import org.joda.time.DateTime
import software.amazon.awssdk.services.dynamodb.DynamoDbAsyncClient

import scala.concurrent.{ExecutionContext, Future}


class LeaseStore(config: LeasesConfig) {
  val client = config.withAWSCredentialsV2(DynamoDbAsyncClient.builder()).build()

  implicit val dateTimeFormat =
    DynamoFormat.coercedXmap[DateTime, String, IllegalArgumentException](DateTime.parse, _.toString)
  implicit val enumFormat =
    DynamoFormat.coercedXmap[MediaLeaseType, String, IllegalArgumentException](MediaLeaseType(_), _.toString)

  private val leasesTable = Table[MediaLease](config.leasesTable)

  def get(id: String)(implicit ec: ExecutionContext): Future[Option[MediaLease]] = {
    ScanamoAsync(client).exec(leasesTable.get("id" === id)).map(_.flatMap(_.toOption))
  }

  def getForMedia(id: String)(implicit ec: ExecutionContext): Future[List[MediaLease]] = {
    ScanamoAsync(client).exec(leasesTable.index("mediaId").query("mediaId" === id)).map(_.flatMap(_.toOption))
  }

  def put(lease: MediaLease)(implicit ec: ExecutionContext) = {
    ScanamoAsync(client).exec(leasesTable.put(lease))
  }

  def putAll(leases: List[MediaLease])(implicit ec: ExecutionContext) = {
    ScanamoAsync(client).exec(leasesTable.putAll(leases.toSet))
  }

  def delete(id: String)(implicit ec: ExecutionContext) = {
    ScanamoAsync(client).exec(leasesTable.delete("id" === id))
  }

  def forEach[T](run: List[MediaLease] => T)(implicit ec: ExecutionContext) = ScanamoAsync(client).exec(
    leasesTable.scan
      .map(ops => ops.flatMap(_.toOption))
      .map(run)
  )
}
