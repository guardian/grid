package controllers

import com.gu.mediaservice.lib.argo._
import com.gu.mediaservice.lib.argo.model.EmbeddedEntity
import com.gu.mediaservice.lib.auth.Authentication
import com.gu.mediaservice.lib.auth.Authentication.Principal
import com.gu.mediaservice.lib.auth.Permissions.{DeleteCropsOrUsages, EditMetadata, DeleteImage => DeleteImagePermission}
import com.gu.mediaservice.lib.auth.Authorisation
import com.gu.mediaservice.lib.logging.{LogMarker, MarkerMap}
import com.gu.mediaservice.lib.play.RequestLoggingFilter
import com.gu.mediaservice.model.Image
import lib.{ImageResponse, MediaApiConfig}
import lib.elasticsearch._
import lib.querysyntax.{IsField, IsValue, Match}
import play.api.libs.json._
import play.api.mvc._

import java.net.URI
import scala.concurrent.{ExecutionContext, Future}

// Ordered image reads for Kupua. Every action admits its body through admitSearchParams, so the
// deleted-search restriction, tier filter and validation are identical across endpoints.
class ImageQueryController(
  auth: Authentication,
  elasticSearch: ElasticSearch,
  imageResponse: ImageResponse,
  config: MediaApiConfig,
  authorisation: Authorisation,
  override val controllerComponents: ControllerComponents,
)(implicit val ec: ExecutionContext) extends BaseController with ArgoHelpers {

  private def SearchAfterPitExpiredResponse = respondError(Gone, "search-after-pit-expired", SearchAfterPitExpired.getMessage)
  private def RankIncompleteResponse = respondError(ServiceUnavailable, "rank-incomplete", ImageRankIncomplete.getMessage)
  private def SortProfileIncompleteResponse = respondError(ServiceUnavailable, "sort-profile-incomplete", SortProfileIncomplete.getMessage)
  private def KeysIncompleteResponse = respondError(ServiceUnavailable, "keys-incomplete", ImageKeysIncomplete.getMessage)
  private def InvalidParamsResponse(message: String) = respondError(BadRequest, "invalid-params", message)

  private val readFailureResponses: PartialFunction[Throwable, Result] = {
    case SearchAfterPitExpired => SearchAfterPitExpiredResponse
    case e: InvalidUriParams => respondError(UnprocessableEntity, InvalidUriParams.errorKey, e.message)
  }

  private case class SearchAfterResponse(
    data:           Seq[EmbeddedEntity[JsValue]],
    total:          Long,
    sortValues:     Seq[Seq[JsValue]],
    nextSortValues: Option[Seq[JsValue]],
    pitId:          Option[String],
  )
  private implicit val searchAfterResponseWrites: OWrites[SearchAfterResponse] =
    (r: SearchAfterResponse) => Json.obj(
      "data"           -> Json.toJson(r.data),
      "total"          -> r.total,
      "sortValues"     -> Json.toJson(r.sortValues),
      "nextSortValues" -> Json.toJson(r.nextSortValues),
      "pitId"          -> r.pitId,
    )

  def searchAfterImages() = auth.async(parse.json) { implicit request =>
    implicit val logMarker: LogMarker = MarkerMap(
      "requestType" -> "search-after",
      "requestId"   -> RequestLoggingFilter.getRequestId(request),
    ) ++ RequestLoggingFilter.loggablePrincipal(request.user)

    val include = includedFrom(request)

    admitSearchParams(request) { validParams =>
      SearchAfterParamsBody.fromJson(request.body, validParams).fold(
        err => Future.successful(InvalidParamsResponse(err)),
        params => elasticSearch.searchAfter(params).map { raw =>
          Ok(Json.toJson(SearchAfterResponse(
            data           = raw.hits.map((hitToImageEntity(request, include) _).tupled),
            total          = raw.total,
            sortValues     = raw.sortValues,
            nextSortValues = raw.nextSortValues,
            pitId          = raw.pitId,
          ))).as(ArgoMediaType)
        }.recover(readFailureResponses)
      )
    }
  }

  private case class ImageWindowResponse(
    data:        Seq[EmbeddedEntity[JsValue]],
    offset:      Int,
    total:       Option[Long],
    sortValues:  Seq[Seq[JsValue]],
    rawHitCount: Int,
    pitId:       Option[String],
  )
  private implicit val imageWindowResponseWrites: OWrites[ImageWindowResponse] = Json.writes[ImageWindowResponse]

  def windowImages() = auth.async(parse.json) { implicit request =>
    implicit val logMarker: LogMarker = MarkerMap(
      "requestType" -> "image-window",
      "requestId"   -> RequestLoggingFilter.getRequestId(request),
    ) ++ RequestLoggingFilter.loggablePrincipal(request.user)

    val include = includedFrom(request)

    admitSearchParams(request) { validParams =>
      ImageWindowParamsBody.fromJson(request.body, validParams).fold(
        err => Future.successful(InvalidParamsResponse(err)),
        params => elasticSearch.imageWindow(params).map { raw =>
          Ok(Json.toJson(ImageWindowResponse(
            data        = raw.hits.map((hitToImageEntity(request, include) _).tupled),
            offset      = validParams.offset,
            total       = raw.total,
            sortValues  = raw.sortValues,
            rawHitCount = raw.rawHitCount,
            pitId       = raw.pitId,
          ))).as(ArgoMediaType)
        }.recover(readFailureResponses)
      )
    }
  }

  private case class ImageRankResponse(rank: Long, pitId: Option[String])
  private implicit val imageRankResponseWrites: OWrites[ImageRankResponse] = Json.writes[ImageRankResponse]

  def rankImages() = auth.async(parse.json) { implicit request =>
    implicit val logMarker: LogMarker = MarkerMap(
      "requestType" -> "image-rank",
      "requestId"   -> RequestLoggingFilter.getRequestId(request),
    ) ++ RequestLoggingFilter.loggablePrincipal(request.user)

    admitSearchParams(request) { validParams =>
      ImageRankParamsBody.fromJson(request.body, validParams).fold(
        err => Future.successful(InvalidParamsResponse(err)),
        params => elasticSearch.imageRank(params).map { raw =>
          Ok(Json.toJson(ImageRankResponse(rank = raw.rank, pitId = raw.pitId))).as(ArgoMediaType)
        }.recover(readFailureResponses.orElse { case ImageRankIncomplete => RankIncompleteResponse })
      )
    }
  }

  def sortProfile() = auth.async(parse.json) { implicit request =>
    implicit val logMarker: LogMarker = MarkerMap(
      "requestType" -> "sort-profile",
      "requestId"   -> RequestLoggingFilter.getRequestId(request),
    ) ++ RequestLoggingFilter.loggablePrincipal(request.user)

    admitSearchParams(request) { validParams =>
      SortProfileParamsBody.fromJson(request.body, validParams).fold(
        err => Future.successful(InvalidParamsResponse(err)),
        params => elasticSearch.sortProfile(params).map { raw =>
          val pit = raw.pitId.fold(Json.obj())(pitId => Json.obj("pitId" -> pitId))
          Ok(Json.toJsObject(raw.result) ++ pit).as(ArgoMediaType)
        }.recover(readFailureResponses.orElse { case SortProfileIncomplete => SortProfileIncompleteResponse })
      )
    }
  }

  def imageKeys() = auth.async(parse.json) { implicit request =>
    implicit val logMarker: LogMarker = MarkerMap(
      "requestType" -> "image-keys",
      "requestId"   -> RequestLoggingFilter.getRequestId(request),
    ) ++ RequestLoggingFilter.loggablePrincipal(request.user)

    admitSearchParams(request) { validParams =>
      ImageKeysParamsBody.fromJson(request.body, validParams).fold(
        err => Future.successful(InvalidParamsResponse(err)),
        params => elasticSearch.imageKeys(params).map { raw =>
          val pit = raw.pitId.fold(Json.obj())(pitId => Json.obj("pitId" -> pitId))
          Ok(Json.obj("keys" -> raw.result.keys, "after" -> raw.result.after) ++ pit).as(ArgoMediaType)
        }.recover(readFailureResponses.orElse { case ImageKeysIncomplete => KeysIncompleteResponse })
      )
    }
  }

  private def admitSearchParams(request: Authentication.Request[JsValue])(read: SearchParams => Future[Result]): Future[Result] =
    SearchParamsBody.fromJson(request.body, request.user.accessor.tier)
      .map(restrictDeletedSearch(request.user))
      .fold(
        err => Future.successful(InvalidParamsResponse(err)),
        searchParams => SearchParams.validate(searchParams).fold(
          errors => Future.successful(respondError(UnprocessableEntity, InvalidUriParams.errorKey, errors.map(_.message).mkString("; "))),
          read
        )
      )

  // Mirrors imageSearch's is:deleted rule: without delete permission, deleted images are the caller's own.
  private def restrictDeletedSearch(user: Principal)(params: SearchParams): SearchParams = {
    val searchesDeleted = params.structuredQuery.exists {
      case Match(IsField, IsValue(value)) => value.equalsIgnoreCase("deleted")
      case _ => false
    }
    if (searchesDeleted && !authorisation.isUploaderOrHasPermission(user, "", DeleteImagePermission))
      params.copy(uploadedBy = Some(Authentication.getIdentity(user)))
    else params
  }

  private def includedFrom(request: RequestHeader): List[String] =
    request.getQueryString("include").map(_.split(",").map(_.trim).toList).getOrElse(List())

  // Same entity construction as MediaApi.imageSearch's hitToImageEntity.
  private def hitToImageEntity(
    request: Authentication.Request[_],
    include: List[String]
  )(elasticId: String, image: SourceWrapper[Image])(implicit logMarker: LogMarker): EmbeddedEntity[JsValue] = {
    val writePermission = authorisation.isUploaderOrHasPermission(request.user, image.instance.uploadedBy, EditMetadata)
    val deletePermission = authorisation.isUploaderOrHasPermission(request.user, image.instance.uploadedBy, DeleteImagePermission)
    val deleteCropsOrUsagePermission = authorisation.hasPermissionTo(DeleteCropsOrUsages)(request.user)

    val (imageData, imageLinks, imageActions) =
      imageResponse.create(elasticId, image, writePermission, deletePermission, deleteCropsOrUsagePermission, include, request.user.accessor.tier)
    val id = (imageData \ "id").as[String]
    EmbeddedEntity(uri = URI.create(s"${config.rootUri}/images/$id"), data = Some(imageData), imageLinks, imageActions)
  }
}
