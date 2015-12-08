package controllers

import java.net.URI

import scala.concurrent.ExecutionContext.Implicits.global
import scala.concurrent.Future
import scala.util.Try

import play.api.libs.json.JsError
import play.api.Logger
import play.api.Logger
import play.api.mvc.Controller
import play.api.mvc.Results._
import play.api.mvc.Results._
import play.api.mvc.{Controller, BodyParsers}
import play.utils.UriEncoding

import rx.lang.scala.Observable

import com.gu.mediaservice.lib.argo.ArgoHelpers
import com.gu.mediaservice.lib.argo.model.{Action, Link, EntityReponse}
import com.gu.mediaservice.lib.auth
import com.gu.mediaservice.lib.auth.KeyStore
import com.gu.mediaservice.lib.aws.NoItemFound
import com.gu.mediaservice.model.Usage

import lib._
import model._


object UsageApi extends Controller with ArgoHelpers {

  import Config._

  val keyStore = new KeyStore(keyStoreBucket, awsCredentials)
  val Authenticated = auth.Authenticated(keyStore, loginUriTemplate, kahunaUri)

  private def wrapUsage(usage: Usage): EntityReponse[Usage] = {
    EntityReponse(
      uri = usageUri(usage.id),
      data = usage
    )
  }

  private def usageUri(usageId: String): Option[URI] = {
    val encodedUsageId = UriEncoding.encodePathSegment(usageId, "UTF-8")
    Try { new URI(s"${Config.usageUri}/usages/${encodedUsageId}") }.toOption
  }

  val indexResponse = {
    val indexData = Map("description" -> "This is the Usage Recording service")
    val indexLinks = List(
      Link("usages-by-media", s"${Config.usageUri}/usages/media/{id}"),
      Link("usages-by-id", s"${Config.usageUri}/usages/{id}")
    )

    val printPostUri = new URI(s"${Config.usageUri}/usages/print")
    val actions = List(
      Action("print-usage", printPostUri, "POST")
    )

    respond(indexData, indexLinks, actions)
  }
  def index = Authenticated { indexResponse }

  def forUsage(usageId: String) = Authenticated.async {
    val usageFuture = UsageTable.queryByUsageId(usageId)

    usageFuture.map[play.api.mvc.Result]((mediaUsageOption: Option[MediaUsage]) => {
      mediaUsageOption.foldLeft(
        respondNotFound("No usages found.")
      )((_, mediaUsage: MediaUsage) => {
        val usage = UsageBuilder.build(mediaUsage)
        val mediaId = mediaUsage.mediaId

        val uri = usageUri(usage.id)
        val links = List(
          Link("media", s"${services.apiBaseUri}/images/${mediaId}"),
          Link("media-usage", s"${services.usageBaseUri}/usages/media/${mediaId}")
        )

        respond[Usage](data = usage, uri = uri, links = links)
      })
    }).recover { case error: Exception => {
      Logger.error("UsageApi returned an error.", error)
      respondError(InternalServerError, "usage-retrieve-failed", error.getMessage())
    }}

  }

  def forMedia(mediaId: String) = Authenticated.async {
    val usagesFuture = UsageTable.queryByImageId(mediaId)

    usagesFuture.map[play.api.mvc.Result]((mediaUsages: Set[MediaUsage]) => {
      val usages = mediaUsages.toList.map(UsageBuilder.build)

      usages match {
        case Nil => respondNotFound("No usages found.")
        case usage :: _ => {
          val uri = Try { new URI(s"${services.usageBaseUri}/usages/media/${mediaId}") }.toOption
          val links = List(
            Link("media", s"${services.apiBaseUri}/images/${mediaId}")
          )

          respondCollection[EntityReponse[Usage]](
            uri = uri,
            links = links,
            data = usages.map(wrapUsage)
          )
        }
      }
    }).recover { case error: Exception => {
      Logger.error("UsageApi returned an error.", error)
      respondError(InternalServerError, "image-usage-retrieve-failed", error.getMessage())
    }}

  }

  def setPrintUsages = Authenticated.async(BodyParsers.parse.json) { request => {
      val printUsageRequestResult = request.body.validate[PrintUsageRequest]
      printUsageRequestResult.fold(
        e => Future {
          respondError(BadRequest, "print-usage-request-parse-failed", JsError.toFlatJson(e).toString)
        },
        printUsageRequest => {

          val usageGroups = UsageGroup.build(printUsageRequest.printUsageRecords)

          val dbUpdate = Observable.from(usageGroups.map(UsageRecorder.recordUpdates))
            .flatten.toArray.take(1).toBlocking.toFuture

            dbUpdate.map[play.api.mvc.Result](_ => respond("ok")).recover { case error: Exception => {
              Logger.error("UsageApi returned an error.", error)

              respondError(InternalServerError, "image-usage-post-failed", error.getMessage())
            }}
        }
      )
    }
  }
}
