package lib

import rx.lang.scala.Observable
import scala.concurrent.duration._

import scala.concurrent.ExecutionContext.Implicits.global
import scala.concurrent.Future

import com.gu.contentapi.client.GuardianContentClient
import com.gu.contentapi.client.model.SearchResponse
import com.gu.contentapi.client.model.v1.Content

import com.gu.mediaservice.lib.aws.{DynamoDB, NoItemFound}

import org.joda.time.DateTime

import play.api.libs.json._


object MergedContentStream {
  val observable: Observable[ContentContainer] =
    LiveContentPollStream.observable.merge(
      PreviewContentPollStream.observable)
}

object LiveContentPollStream extends ContentPollStream {
  val capi = LiveContentApi
  val observable = rawObservable.map(LiveContentItem(_))

}

object PreviewContentPollStream extends ContentPollStream {
  val capi = PreviewContentApi
  val observable = rawObservable.map(PreviewContentItem(_))
}

trait ContentContainer {
  val content: Content
}

case class LiveContentItem(content: Content) extends ContentContainer
case class PreviewContentItem(content: Content) extends ContentContainer

trait ContentPollStream {

  val observable: Observable[ContentContainer]
  val capi: GuardianContentClient

  val dynamo = new DynamoDB(Config.awsCredentials, Config.dynamoRegion, Config.pollerTable)

  def splitResponse(response: SearchResponse) = Observable.from(response.results)

  def getContent: Observable[SearchResponse] = {
    val latestByLatestModified = capi.search
      .showTags("all")
      .orderBy("newest").useDate("last-modified")
      .showElements("all")
      .pageSize(100)

    Observable.from[SearchResponse](capi.getResponse(latestByLatestModified))
  }


  def getItemObservable(contentItem: Content): Observable[Content] = {
    Observable.from[JsObject](dynamo.get(contentItem.id))
      .filter(jsonObject => {
        val dbLastModified = DateTime.parse(jsonObject.value("lastModified").as[String])
        val currentLastModified = extractLastModified(contentItem)

        dbLastModified.isBefore(currentLastModified)
      }).map(_ => contentItem)
  }

  def extractLastModified(contentItem: Content): DateTime =
    contentItem.fields
      .flatMap(_.lastModified)
      .map(capiDateTime => DateTime.parse(capiDateTime.dateTime.toString))
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

  val pollInterval  = Duration(5, SECONDS)
  val rawObservable =  Observable.interval(pollInterval)
    .flatMap(_ => getContent)
    .flatMap(splitResponse)
    .flatMap(checkDynamo)

}
