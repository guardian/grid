package com.gu.mediaservice.lib.argo

import java.net.URI
import play.api.libs.json.{Json, Writes}
import play.api.mvc.{Results, Result}

import com.gu.mediaservice.lib.argo.model._


trait ArgoHelpers extends Results {

  val ArgoMediaType = "application/vnd.argo+json"

  // FIXME: DSL to append links?
  def respond[T](data: T, links: List[Link] = Nil)(implicit writes: Writes[T]): Result = {
    val response = EntityReponse(
      data  = data,
      links = links
    )

    serializeAndWrap(response, Ok)
  }

  def respondCollection[T](data: Seq[T], offset: Option[Long] = None, total: Option[Long] = None, links: List[Link] = Nil, uri: Option[URI] = None)
                          (implicit writes: Writes[T]): Result = {
    val response = CollectionReponse(
      uri    = uri,
      offset = offset,
      length = Some(data.size),
      total  = total,
      data   = data,
      links  = links
    )

    serializeAndWrap(response, Ok)
  }

// TODO: bring back once useful (causes Scala compiler tears)
//  def respondError[T](errorStatus: Status, errorKey: String, errorMessage: String, data: Option[T], links: List[Link] = Nil)
//                     (implicit writes: Writes[T]): Result = {
//    val response = ErrorReponse(
//      errorKey     = errorKey,
//      errorMessage = errorMessage,
//      data         = data,
//      links        = links
//    )
//
//    serializeAndWrap(response, errorStatus)
//  }

  // TODO: find a nicer way to serialise ErrorResponse[Nothing] without this hack
  def respondError(errorStatus: Status, errorKey: String, errorMessage: String, links: List[Link] = Nil): Result = {
    val response = ErrorReponse[Int](
      errorKey     = errorKey,
      errorMessage = errorMessage,
      data         = None,
      links        = links
    )

    serializeAndWrap(response, errorStatus)
  }


  private def serializeAndWrap[T](response: T, status: Status)(implicit writes: Writes[T]): Result = {
    val json = Json.toJson(response)
    status(json).as(ArgoMediaType)
  }

}
