package com.gu.mediaservice

import java.net.URL

import com.gu.mediaservice.GridClient.{Error, Found, NotFound}
import com.gu.mediaservice.lib.auth.provider.ApiKeyAuthentication
import com.gu.mediaservice.lib.config.{ServiceHosts, Services}
import com.gu.mediaservice.model._
import com.typesafe.scalalogging.LazyLogging
import org.joda.time.DateTime
import play.api.libs.ws.{WSClient, WSRequest}

import scala.concurrent.duration.Duration
import scala.concurrent.{Await, ExecutionContext, Future}

object ImageDataMergerConfig {

  def apply(apiKey: String, domainRoot: String, imageLoaderEndpointOpt: Option[String])(implicit wsClient: WSClient, ec: ExecutionContext): ImageDataMergerConfig = {
    val services = new Services(domainRoot, ServiceHosts.guardianPrefixes, Set.empty)
    val imageLoaderEndpoint = imageLoaderEndpointOpt match {
      case Some(uri) => uri
      case None => services.loaderBaseUri
    }
    new ImageDataMergerConfig(apiKey, services, imageLoaderEndpoint)
  }
}

case class ImageDataMergerConfig(apiKey: String, services: Services, imageLoaderEndpoint: String)(implicit wsClient: WSClient, ec: ExecutionContext) extends ApiKeyAuthentication {
  val gridClient: GridClient = GridClient(services)(wsClient)
}

object ImageProjectionOverrides extends LazyLogging {

  def overrideSelectedFields(img: Image): Image = {
    logger.info(s"applying metadata overrides")

    val metadataEdits: Option[ImageMetadata] = img.userMetadata.map(_.metadata)
    val usageRightsEdits: Option[UsageRights] = img.userMetadata.flatMap(_.usageRights)

    val chain = overrideMetadataWithUserEditsIfExists(metadataEdits) _ compose
      overrideUsageRightsWithUserEditsIfExists(usageRightsEdits) compose overrideWithInferredLastModifiedDate

    chain.apply(img)
  }

  private def overrideMetadataWithUserEditsIfExists(metadataEdits: Option[ImageMetadata])(img: Image) = {
    metadataEdits match {
      case Some(metadataEdits) =>
        val origMetadata = img.metadata

        val finalImageMetadata = origMetadata.copy(
          // likely to be editable in the future
          dateTaken = metadataEdits.dateTaken.orElse(origMetadata.dateTaken),
          // editable now
          description = handleEmptyString(metadataEdits.description.orElse(origMetadata.description)),
          credit = handleEmptyString(metadataEdits.credit.orElse(origMetadata.credit)),
          byline = handleEmptyString(metadataEdits.byline.orElse(origMetadata.byline)),
          title = handleEmptyString(metadataEdits.title.orElse(origMetadata.title)),
          copyright = handleEmptyString(metadataEdits.copyright.orElse(origMetadata.copyright)),
          specialInstructions = handleEmptyString(metadataEdits.specialInstructions.orElse(origMetadata.specialInstructions)),
          // likely to be editable in the future
          subLocation = handleEmptyString(metadataEdits.subLocation.orElse(origMetadata.subLocation)),
          city = handleEmptyString(metadataEdits.city.orElse(origMetadata.city)),
          state = handleEmptyString(metadataEdits.state.orElse(origMetadata.state)),
          country = handleEmptyString(metadataEdits.country.orElse(origMetadata.country)),
        )

        /**
          * if any additional field will be added to ImageMetadata
          * or fields that are not reflect here will become editable
          * that should be addressed in this code
          * which is propagating user edits to metadata entry in elasticsearch
          **/

        img.copy(
          metadata = finalImageMetadata
        )
      case _ => img
    }
  }

  private def overrideWithInferredLastModifiedDate(img: Image) = {
    val lastModifiedFinal = inferLastModifiedDate(img)
    img.copy(
      lastModified = lastModifiedFinal
    )
  }

  private def inferLastModifiedDate(image: Image): Option[DateTime] = {

    /**
      * TODO
      * it is using userMetadataLastModified field now
      * because it is not persisted now anywhere else then ElasticSearch
      * and projection is initially created to be able to project records that are missing in ElasticSearch
      * so TODO userMetadataLastModified should be stored in dynamo additionally
      **/

    val dtOrdering = Ordering.by((_: DateTime).getMillis())

    val exportsDates = image.exports.flatMap(_.date)
    val collectionsDates = image.collections.map(_.actionData.date)
    val usagesDates = image.usages.map(_.lastModified)

    val lmDatesCandidates: List[DateTime] = List(
      image.lastModified,
      image.leases.lastModified
    ).flatten ++ exportsDates ++ collectionsDates ++ usagesDates

    Option(lmDatesCandidates).collect { case dates if dates.nonEmpty => dates.max(dtOrdering) }
  }

  private def handleEmptyString(entry: Option[String]): Option[String] = entry.collect { case x if x.trim.nonEmpty => x }

  private def overrideUsageRightsWithUserEditsIfExists(usageRightsEdits: Option[UsageRights])(img: Image) = {
    usageRightsEdits match {
      case Some(usrR) => img.copy(usageRights = usrR)
      case _ => img
    }
  }

}

trait FullImageProjectionResult

case class FullImageProjectionSuccess(image: Option[Image]) extends FullImageProjectionResult

case class FullImageProjectionFailed(message: String, downstreamErrorMessage: String) extends FullImageProjectionResult

class ImageDataMerger(config: ImageDataMergerConfig) extends ApiKeyAuthentication with LazyLogging {

  import config._
  import services._

  // Authorise with api key
  private def authFunction(request: WSRequest) = request.withHttpHeaders((apiKeyHeaderName, apiKey))

  def isValidApiKey(implicit ec: ExecutionContext): Future[Boolean] = {
    // Make an API key authenticated request to the leases API as a way of validating the API key.
    // A 200/404 indicates a valid key.
    // Using leases because its a low traffic API.
    class BadApiKeyException extends Exception
    import com.gu.mediaservice.GridClient.{Found, NotFound, Error}
    gridClient.makeGetRequestAsync(new URL(services.leasesBaseUri), authFunction) map {
      case Found(_, _) => true
      case NotFound(_, _) => true
      case Error(_, _, _) => false
    }
  }

  def getMergedImageData(mediaId: String)(implicit ec: ExecutionContext): FullImageProjectionResult = {
    try {
      val maybeImageFuture = getMergedImageDataInternal(mediaId)
      val mayBeImage: Option[Image] = Await.result(maybeImageFuture, Duration.Inf)
      FullImageProjectionSuccess(mayBeImage)
    } catch {
      case e: DownstreamApiInBadStateException =>
        FullImageProjectionFailed(e.getMessage, e.getDownstreamMessage)
    }
  }

  private def getMergedImageDataInternal(mediaId: String)(implicit ec: ExecutionContext): Future[Option[Image]] = for {
    maybeStubImage <- gridClient.getImageLoaderProjection(mediaId, imageLoaderEndpoint, authFunction)
    image <- aggregate(maybeStubImage)
  } yield image.map { aggImg =>
    ImageProjectionOverrides.overrideSelectedFields(aggImg)
  }

  private def aggregate(maybeImage: Option[Image])(implicit ec: ExecutionContext): Future[Option[Image]] = maybeImage match {
    case Some(image) =>
      logger.info(s"starting to aggregate image")
      val mediaId = image.id
      for {
        collections <- getCollectionsResponse(mediaId)
        edits <- gridClient.getEdits(mediaId, authFunction)
        leases <- gridClient.getLeases(mediaId, authFunction)
        usages <- gridClient.getUsages(mediaId, authFunction)
        crops <- gridClient.getCrops(mediaId, authFunction)
      } yield Some(image.copy(
        collections = collections,
        userMetadata = edits,
        leases = leases,
        usages = usages,
        exports = crops
      ))
    case None => Future.successful(None)
  }

  private def getCollectionsResponse(mediaId: String)(implicit ec: ExecutionContext): Future[List[Collection]] = {
    logger.info("attempt to get collections")
    val url = new URL(s"$collectionsBaseUri/images/$mediaId")
    gridClient.makeGetRequestAsync(url, authFunction) map {
      case Found(json, _) => (json \ "data").as[List[Collection]]
      case NotFound(_, _) => Nil
      case e@Error(_, _, _) => e.logErrorAndThrowException()
    }
  }

}

