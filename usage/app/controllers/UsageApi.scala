package controllers

import java.net.URI

import play.api.libs.json.JsError
import play.api.Logger
import play.api.mvc.Results._
import play.api.mvc.{Controller, BodyParsers}

import scala.concurrent.ExecutionContext.Implicits.global
import scala.concurrent.Future
import scala.util.Try

import rx.lang.scala.Observable

import com.gu.mediaservice.lib.argo.ArgoHelpers
import com.gu.mediaservice.lib.argo.model.Link
import com.gu.mediaservice.lib.auth
import com.gu.mediaservice.lib.auth.KeyStore
import com.gu.mediaservice.lib.aws.NoItemFound

import lib._
import model._


object UsageApi extends Controller with ArgoHelpers {

  import Config.{awsCredentials, kahunaUri, keyStoreBucket, loginUriTemplate, rootUri}

  val keyStore = new KeyStore(keyStoreBucket, awsCredentials)
  val Authenticated = auth.Authenticated(keyStore, loginUriTemplate, kahunaUri)

  val indexResponse = {
    val indexData = Map("description" -> "This is the Usage Recording service")
    val indexLinks = List(
      Link("usage", s"$rootUri/usage/media/{id}")
    )
    respond(indexData, indexLinks)
  }
  def index = Authenticated { indexResponse }

  def forMedia(mediaId: String) = Authenticated.async {
    val usagesFuture = UsageTable.queryByImageId(mediaId)

    usagesFuture.map[play.api.mvc.Result]((usages: Set[MediaUsage]) => {
      val uri = Try { new URI(s"${Config.usageUri}/usages/media/${mediaId}") }.toOption

      UsageResponse.build(usages, uri)
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
          val dbUpdate = Observable.from(usageGroups.map(UsageRecorder.recordUpdates)).flatten
            .toBlocking.toFuture

            dbUpdate.map[play.api.mvc.Result](_ => respond("ok")).recover { case error: Exception => {
              Logger.error("UsageApi returned an error.", error)

              respondError(InternalServerError, "image-usage-post-failed", error.getMessage())
            }}
        }
      )
    }
  }
}
