package lib

import java.net.InetAddress
import java.util.UUID

import akka.Done
import akka.actor.ActorSystem
import akka.stream.Materializer
import akka.stream.scaladsl.Source
import com.amazonaws.services.kinesis.clientlibrary.lib.worker.{InitialPositionInStream, KinesisClientLibConfiguration}
import com.contxt.kinesis.{KinesisRecord, KinesisSource}
import lib.kinesis.ThrallEventConsumer
import org.joda.time.DateTime
import play.api.Logger

import scala.concurrent.Future
import scala.util.{Failure, Success}

class ThrallStreamProcessor(config: ThrallConfig, consumer: ThrallEventConsumer, actorSystem: ActorSystem, materializer: Materializer) {

  implicit val mat = materializer

  private val workerId = InetAddress.getLocalHost.getCanonicalHostName + ":" + UUID.randomUUID()

  private val kinesisConfig = {
    import config.{thrallKinesisEndpoint, thrallKinesisDynamoEndpoint, awsRegion}
    Logger.info(s"creating kinesis consumer with endpoint=$thrallKinesisEndpoint, region=$awsRegion")
    kinesisClientLibConfig(
      kinesisAppName = config.thrallKinesisStream,
      streamName = config.thrallKinesisStream,
      from = config.from
    ).withKinesisEndpoint(thrallKinesisEndpoint)
     .withDynamoDBEndpoint(thrallKinesisDynamoEndpoint)
  }

  val kinesisSource: Source[KinesisRecord, Future[Done]] = KinesisSource(kinesisConfig)

  implicit val dispatcher = actorSystem.getDispatcher

  def run(): Future[Done] = {
    val streamRunning = kinesisSource.map{ record =>
      record -> consumer.parseRecord(record.data.toArray, record.approximateArrivalTimestamp)
    }.mapAsync(1) {
      case (record, Some(updateMessage)) => consumer.processUpdateMessage(updateMessage).recover{case _ => ()}.map(_ => record)
      case (record, None) => Future.successful(record)
    }.runForeach { case (record) =>
      record.markProcessed()
    }

    streamRunning.onComplete {
      case Failure(exception) => Logger.error("stream completed with failure", exception)
      case Success(_) => Logger.info("Stream completed with done, probably shutting down")
    }

    streamRunning
  }

  private def kinesisClientLibConfig(kinesisAppName: String, streamName: String, from: Option[DateTime]): KinesisClientLibConfiguration = {
    val credentialsProvider = config.awsCredentials

    val kinesisConfig = new KinesisClientLibConfiguration(
      kinesisAppName,
      streamName,
      credentialsProvider,
      credentialsProvider,
      credentialsProvider,
      workerId
    ).withRegionName(config.awsRegion).
      withMaxRecords(100).
      withIdleMillisBetweenCalls(1000).
      withIdleTimeBetweenReadsInMillis(250).
      withCallProcessRecordsEvenForEmptyRecordList(true)
    from.fold(
      kinesisConfig.withInitialPositionInStream(InitialPositionInStream.TRIM_HORIZON)
    ){ f =>
      kinesisConfig.withTimestampAtInitialPositionInStream(f.toDate)
    }
  }
}
