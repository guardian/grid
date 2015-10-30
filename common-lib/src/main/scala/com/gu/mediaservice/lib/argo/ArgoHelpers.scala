package com.gu.mediaservice.lib.argo

import java.net.URI
import play.api.libs.json.{Json, Writes}
import play.api.mvc.{Results, Result}

import com.gu.mediaservice.lib.argo.model._


trait ArgoHelpers extends Results {

  val ArgoMediaType = "application/vnd.argo+json"

  // FIXME: DSL to append links and actions?
  def respond[T](data: T, links: List[Link] = Nil, actions: List[Action] = Nil, uri: Option[URI] = None)
                (implicit writes: Writes[T]): Result = {
    val response = EntityReponse(
      uri     = uri,
      data    = data,
      links   = links,
      actions = actions
    )

    serializeAndWrap(response, Ok)
  }

  def respondCollections[T](
    uri: Option[URI] = None,
    data: Map[String, Seq[T]],
    links: List[Link] = Nil
  ) (implicit writes: Writes[T]): Result = {
    val collections = data.map({ case (key, collection) => {
      key -> CollectionReponse(
        length = Some(collection.length),
        data = collection
      )
    }})

    val response = EntityReponse(
      uri     = uri,
      data    = collections,
      links   = links
    )

    serializeAndWrap(response, Ok)
  }

  def respondCollection[T](data: Seq[T], offset: Option[Long] = None, total: Option[Long] = None,
                           links: List[Link] = Nil, uri: Option[URI] = None)
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

  def respondNotFound(errorMessage: String): Result = {
    val response = ErrorReponse[Int](
      errorKey     = "not-found",
      errorMessage = errorMessage,
      data         = None,
      links        = Nil
    )

    serializeAndWrap(response, Status(404))
  }


  private def serializeAndWrap[T](response: T, status: Status)(implicit writes: Writes[T]): Result = {
    val json = Json.toJson(response)
    status(json).as(ArgoMediaType)
  }

}
