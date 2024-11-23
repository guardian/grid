package lib

import com.gu.mediaservice.model.Instance
import com.gu.mediaservice.model.leases.{MediaLease, MediaLeaseType}
import org.joda.time.DateTime
import org.scanamo._
import org.scanamo.generic.auto.Typeclass
import org.scanamo.generic.semiauto.deriveDynamoFormat
import org.scanamo.syntax._
import software.amazon.awssdk.services.dynamodb.model.{AttributeValue, PutItemRequest}
import software.amazon.awssdk.services.dynamodb.{DynamoDbAsyncClient, model}

import java.util
import scala.concurrent.{ExecutionContext, Future}

class LeaseStore(config: LeasesConfig) {
  val client = config.withAWSCredentialsV2(DynamoDbAsyncClient.builder()).build()
  val syncClient = config.dynamoDBV2Builder().build()

  implicit val dateTimeFormat: Typeclass[DateTime] =
    DynamoFormat.coercedXmap[DateTime, String, IllegalArgumentException](DateTime.parse, _.toString)
  implicit val enumFormat: Typeclass[MediaLeaseType] =
    DynamoFormat.coercedXmap[MediaLeaseType, String, IllegalArgumentException](MediaLeaseType(_), _.toString)

  implicit val formatLeases: DynamoFormat[com.gu.mediaservice.model.leases.MediaLease] = deriveDynamoFormat[com.gu.mediaservice.model.leases.MediaLease]

  private val leasesTable = Table[MediaLease](config.leasesTable)

  def get(id: String)(implicit ec: ExecutionContext, instance: Instance): Future[Option[MediaLease]] = {
    ScanamoAsync(client).exec(leasesTable.get("id" === id and "instance" === instance.id)).map(_.flatMap(_.toOption))
  }

  def getForMedia(id: String)(implicit ec: ExecutionContext, instance: Instance): Future[List[MediaLease]] = {
    ScanamoAsync(client).exec(leasesTable.index("mediaId").query("mediaId" === id and "instance" === instance.id)).map(_.flatMap(_.toOption))
  }

  def put(lease: MediaLease)(implicit ec: ExecutionContext, instance: Instance) = {
    // TODO bypass scanomo to put on composite key
    val map: util.Map[String, model.AttributeValue] = formatLeases.write(lease).asObject.get.toJavaMap
    map.put("instance", AttributeValue.fromS(instance.id))
    val putRequest = PutItemRequest.builder().
      tableName(config.leasesTable)
      .item(map)
      .build()
    syncClient.putItem(putRequest)
    Future.successful(true)
  }

  def putAll(leases: List[MediaLease])(implicit ec: ExecutionContext, instance: Instance) = {
    // TODO BATCH
    leases.foreach { l =>
      put(l)
    }
    Future.successful(true)
  }

  def delete(id: String)(implicit ec: ExecutionContext, instance: Instance) = {
    ScanamoAsync(client).exec(leasesTable.delete("id" === id and "instance" === instance.id))
  }

  def forEach[T](run: List[MediaLease] => T)(implicit ec: ExecutionContext, instance: Instance) = {
    val instanceLeasesQuery = leasesTable.query("instance" === instance.id)
    ScanamoAsync(client).exec(instanceLeasesQuery).map(ops => ops.flatMap(_.toOption))
      .map(run)
  }
}
