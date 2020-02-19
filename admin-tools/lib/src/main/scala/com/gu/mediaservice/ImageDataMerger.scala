package com.gu.mediaservice

import java.net.URL

import com.gu.mediaservice.lib.config.{ServiceHosts, Services}
import com.gu.mediaservice.model._
import com.gu.mediaservice.model.leases.LeasesByMedia
import com.gu.mediaservice.model.usage.Usage
import com.typesafe.scalalogging.LazyLogging
import org.joda.time.DateTime
import play.api.libs.json._

import scala.concurrent.{ExecutionContext, Future}

object ImageDataMergerConfig {
  private val gridClient = GridClient(maxIdleConnections = 5)

  def apply(apiKey: String, domainRoot: String): ImageDataMergerConfig = {
    val services = new Services(domainRoot, ServiceHosts.guardianPrefixes, Set.empty)
    new ImageDataMergerConfig(apiKey, services, gridClient)
  }
}

case class ImageDataMergerConfig(apiKey: String, services: Services, gridClient: GridClient) {
  def isValidApiKey(): Boolean = {
    // Make an API key authenticated request to the leases API as a way of validating the API key.
    // A 200 indicates a valid key.
    // Using leases because its a low traffic API.
    gridClient.makeGetRequestSync(new URL(services.leasesBaseUri), apiKey).statusCode == 200
  }
}

object ImageProjectionOverrides extends LazyLogging {

  def overrideSelectedFields(img: Image): Image = {
    logger.info(s"applying metadata overrides")

    val metadataEdits: Option[ImageMetadata] = img.userMetadata.map(_.metadata)
    val usageRightsEdits: Option[UsageRights] = img.userMetadata.flatMap(_.usageRights)

    val chain = overrideWithMetadataEditsIfExists(metadataEdits) _ compose
      overrideWithUsageEditsIfExists(usageRightsEdits) compose overrideInferredLastModifiedDate

    chain.apply(img)
  }

  private def overrideWithMetadataEditsIfExists(metadataEdits: Option[ImageMetadata])(img: Image) = {
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

  private def overrideInferredLastModifiedDate(img: Image) = {
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
      * */

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

  private def overrideWithUsageEditsIfExists(usageRightsEdits: Option[UsageRights])(img: Image) = {
    usageRightsEdits match {
      case Some(usrR) => img.copy(usageRights = usrR)
      case _ => img
    }
  }

}

class ImageDataMerger(config: ImageDataMergerConfig) extends LazyLogging {

  import config._
  import services._


  def getMergedImageData(mediaId: String)(implicit ec: ExecutionContext): Future[Option[Image]] = {
    val maybeImage: Option[Image] = getImageLoaderProjection(mediaId)
    maybeImage match {
      case Some(img) =>
        aggregate(img).map { aggImg =>
          Some(ImageProjectionOverrides.overrideSelectedFields(aggImg))
        }
      case None => Future(None)
    }
  }

  private def aggregate(image: Image)(implicit ec: ExecutionContext): Future[Image] = {
    logger.info(s"starting to aggregate image")
    val mediaId = image.id
    for {
      collections <- getCollectionsResponse(mediaId)
      edits <- getEdits(mediaId)
      leases <- getLeases(mediaId)
      usages <- getUsages(mediaId)
      crops <- getCrops(mediaId)
    } yield image.copy(
      collections = collections,
      userMetadata = edits,
      leases = leases,
      usages = usages,
      exports = crops
    )
  }

  private def getImageLoaderProjection(mediaId: String): Option[Image] = {
    logger.info("attempt to get image projection from image-loader")
    val url = new URL(s"$loaderBaseUri/images/project/$mediaId")
    val res = gridClient.makeGetRequestSync(url, apiKey)
    validateResponse(res.statusCode, url)
    logger.info(s"got image projection from image-loader for $mediaId with status code $res.statusCode")
    if (res.statusCode == 200) Some(res.body.as[Image]) else None
  }

  private def getCollectionsResponse(mediaId: String)(implicit ec: ExecutionContext): Future[List[Collection]] = {
    logger.info("attempt to get collections")
    val url = new URL(s"$collectionsBaseUri/images/$mediaId")
    gridClient.makeGetRequestAsync(url, apiKey).map { res =>
      validateResponse(res.statusCode, url)
      if (res.statusCode == 200) (res.body \ "data").as[List[Collection]] else Nil
    }
  }

  private def getEdits(mediaId: String)(implicit ec: ExecutionContext): Future[Option[Edits]] = {
    logger.info("attempt to get edits")
    val url = new URL(s"$metadataBaseUri/edits/$mediaId")
    gridClient.makeGetRequestAsync(url, apiKey).map { res =>
      validateResponse(res.statusCode, url)
      if (res.statusCode == 200) Some((res.body \ "data").as[Edits]) else None
    }
  }

  private def getCrops(mediaId: String)(implicit ec: ExecutionContext): Future[List[Crop]] = {
    logger.info("attempt to get crops")
    val url = new URL(s"$cropperBaseUri/crops/$mediaId")
    gridClient.makeGetRequestAsync(url, apiKey).map { res =>
      validateResponse(res.statusCode, url)
      if (res.statusCode == 200) (res.body \ "data").as[List[Crop]] else Nil
    }
  }

  private def getLeases(mediaId: String)(implicit ec: ExecutionContext): Future[LeasesByMedia] = {
    logger.info("attempt to get leases")
    val url = new URL(s"$leasesBaseUri/leases/media/$mediaId")
    gridClient.makeGetRequestAsync(url, apiKey).map { res =>
      validateResponse(res.statusCode, url)
      if (res.statusCode == 200) (res.body \ "data").as[LeasesByMedia] else LeasesByMedia.empty
    }
  }

  private def getUsages(mediaId: String)(implicit ec: ExecutionContext): Future[List[Usage]] = {
    logger.info("attempt to get usages")

    def unpackUsagesFromEntityResponse(resBody: JsValue): List[JsValue] = {
      (resBody \ "data").as[JsArray].value
        .map(entity => (entity.as[JsObject] \ "data").as[JsValue]).toList
    }

    val url = new URL(s"$usageBaseUri/usages/media/$mediaId")
    gridClient.makeGetRequestAsync(url, apiKey).map { res =>
      validateResponse(res.statusCode, url)
      if (res.statusCode == 200) unpackUsagesFromEntityResponse(res.body).map(_.as[Usage])
      else Nil
    }
  }

  private def validateResponse(statusCode: Int, url: URL): Unit = {
    if (statusCode != 200 && statusCode != 404) {
      val message = s"breaking the circuit, downstream API: $url is in a bad state, code: $statusCode"
      val errorJson = Json.obj(
        "errorStatusCode" -> statusCode,
        "message" -> message
      )
      logger.error(errorJson.toString())
      throw new IllegalArgumentException(message)
    }
  }
}
