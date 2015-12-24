package lib

import rx.lang.scala.Observable
import scala.concurrent.duration._

import scala.concurrent.ExecutionContext.Implicits.global
import scala.concurrent.Future

import rx.lang.scala.schedulers.ExecutionContextScheduler

import com.gu.contentapi.client.GuardianContentClient
import com.gu.contentapi.client.model.SearchResponse
import com.gu.contentapi.client.model.v1.Content

import com.gu.mediaservice.lib.aws.{DynamoDB, NoItemFound}
import com.gu.mediaservice.lib.rx.SingleThreadedScheduler

import org.joda.time.DateTime

import play.api.libs.json._
import play.api.Logger


object MergedContentStream {
  val observable: Observable[ContentContainer] =
    LiveContentPollStream.observable
      .merge(PreviewContentPollStream.observable)
      .share // Ensures that only one poller is created no matter how many subscribers
}

object LiveContentPollStream extends ContentPollStream with SingleThreadedScheduler {
  val capi = LiveContentApi
  val dynamo = new DynamoDB(Config.awsCredentials, Config.dynamoRegion, Config.livePollTable)
  val observable = rawObservable.map(c => LiveContentItem(c, extractLastModified(c)))
}

object PreviewContentPollStream extends ContentPollStream with SingleThreadedScheduler {
  val capi = PreviewContentApi
  val dynamo = new DynamoDB(Config.awsCredentials, Config.dynamoRegion, Config.previewPollTable)
  val observable = rawObservable.map(c => PreviewContentItem(c, extractLastModified(c)))
}

trait ContentContainer {
  val content: Content
  val lastModified: DateTime
}

case class LiveContentItem(content: Content, lastModified: DateTime) extends ContentContainer
case class PreviewContentItem(content: Content, lastModified: DateTime) extends ContentContainer

trait ContentPollStream {
  import scala.concurrent.duration._
  import scala.math._

  val pollIntervalInSeconds = Config.capiPollIntervalInSeconds
  val maxRetries = Config.capiMaxRetries

  val observable: Observable[ContentContainer]
  val capi: GuardianContentClient
  val dynamo: DynamoDB
  val scheduler: ExecutionContextScheduler

  def splitResponse(response: SearchResponse) = Observable.from(response.results)

  def getContent: Observable[SearchResponse] = {
    val latestByLatestModified = capi.search
      .showTags("all")
      .orderBy("newest").useDate("last-modified")
      .showElements("all")
      .showFields("all")
      .pageSize(Config.capiPageSize)

    val search = capi.getResponse(latestByLatestModified)

    Observable.from[SearchResponse](search)
  }

  def getItemObservable(contentItem: Content): Observable[Content] = {
    Observable.from[JsObject](dynamo.get(contentItem.id))
      .filter(jsonObject => {
        val dbLastModified = DateTime.parse(jsonObject.value("lastModified").as[String])
        val currentLastModified = extractLastModified(contentItem)

        dbLastModified.isBefore(currentLastModified)
      }).flatMap(_ => {
        Observable.from(setDynamoRow(contentItem))
      }).map(_ => contentItem)
  }

  def extractLastModified(contentItem: Content): DateTime =
    contentItem.fields
      .flatMap(_.lastModified)
      .map(capiDateTime => new DateTime(capiDateTime.dateTime))
      .getOrElse(new DateTime())

  def setDynamoRow(contentItem: Content): Future[JsObject] = {
    dynamo.stringSet(
      contentItem.id,
      "lastModified",
      extractLastModified(contentItem).toString
    )
  }

  def setItemObservable(contentItem: Content): Observable[Content] = {
    Observable.from(setDynamoRow(contentItem))
      .map(_ => contentItem)
  }

  def checkDynamo(contentItem: Content): Observable[Content] = {
    getItemObservable(contentItem)
      .onErrorResumeNext((error:Throwable) => { error match {
          case NoItemFound => setItemObservable(contentItem)
          case _ => Observable.just(contentItem)
      }})
  }

  val pollInterval  = Duration(pollIntervalInSeconds, SECONDS)
  case class PollAttempt(lastFail: Throwable, i: Int)

  lazy val retryingPollObservable = Observable.interval(pollInterval)
    .flatMap(_ => getContent).retryWhen(
      _.zipWith(Observable.from(1 to maxRetries))((e: Throwable, i: Int) => PollAttempt(e,i))
      .flatMap(attempt => {
        val isLastAttempt = attempt.i >= maxRetries
        val waitSeconds = pow((attempt.i),2).second

        val logString = s"Request to CAPI failed (attempt ${attempt.i} of ${maxRetries})!\n"
        val retryMessage = s"${attempt.lastFail.getMessage}\nTrying again in ${waitSeconds}"
        val fullMessage = if(isLastAttempt) logString else logString + retryMessage

        Logger.info(fullMessage)

        if (isLastAttempt) throw attempt.lastFail
        Observable.timer(waitSeconds)
      })
    )

  lazy val rawObservable = retryingPollObservable
    .observeOn(scheduler)
    .flatMap(splitResponse)
    .flatMap(checkDynamo)
}
