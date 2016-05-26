package lib

import lib.usagerights.CostCalculator

import java.net.URI
import scala.collection.mutable.ListBuffer
import scala.util.{Try, Failure}
import org.joda.time.{DateTime, Duration}

import play.utils.UriEncoding
import play.api.Logger
import play.api.libs.json._
import play.api.libs.functional.syntax._

import com.gu.mediaservice.model._
import com.gu.mediaservice.lib.argo.model._
import com.gu.mediaservice.lib.collections.CollectionsManager


object ImageResponse extends EditsResponse {
  implicit val dateTimeFormat = DateFormat

  val metadataBaseUri = Config.services.metadataBaseUri

  type FileMetadataEntity = EmbeddedEntity[FileMetadata]

  type UsageEntity = EmbeddedEntity[Usage]
  type UsagesEntity = EmbeddedEntity[List[UsageEntity]]

  type MediaLeaseEntity = EmbeddedEntity[MediaLease]
  type MediaLeasesEntity = EmbeddedEntity[List[MediaLease]]

  def hasPersistenceIdentifier(image: Image) =
    image.identifiers.contains(Config.persistenceIdentifier)

  def hasExports(image: Image) =
    image.exports.nonEmpty

  def isArchived(image: Image) =
    image.userMetadata.exists(_.archived)

  def hasUsages(image: Image) =
    image.usages.nonEmpty

  def isPhotographerCategory[T <: UsageRights](usageRights: T) =
    usageRights match {
      case _:Photographer => true
      case _ => false
    }

  def isIllustratorCategory[T <: UsageRights](usageRights: T) =
    usageRights match {
      case _:Illustrator => true
      case _ => false
    }

  def isAgencyCommissionedCategory[T <: UsageRights](usageRights: T) =
    usageRights match {
      case _: CommissionedAgency => true
      case _ => false
    }

  def imagePersistenceReasons(image: Image): List[String] = {
    val reasons = ListBuffer[String]()

    if (hasPersistenceIdentifier(image))
      reasons += "persistence-identifier"

    if (hasExports(image))
      reasons += "exports"

    if (hasUsages(image))
      reasons += "usages"

    if (isArchived(image))
      reasons += "archived"

    if (isPhotographerCategory(image.usageRights))
      reasons += "photographer-category"

    if (isIllustratorCategory(image.usageRights))
      reasons += "illustrator-category"

    if (isAgencyCommissionedCategory(image.usageRights))
      reasons += CommissionedAgency.category

    reasons.toList
  }

  def canBeDeleted(image: Image) = ! hasExports(image) && ! hasUsages(image)

  def create(id: String, esSource: JsValue, withWritePermission: Boolean,
             withDeletePermission: Boolean, included: List[String] = List()):
            (JsValue, List[Link], List[Action]) = {
    val (image: Image, source: JsValue) = Try {
      val image = esSource.as[Image]
      val source = Json.toJson(image)(
        imageResponseWrites(image.id, included.contains("fileMetadata"))
      )

      (image, source)
    }.recoverWith {
      case e => {
        Logger.error(s"Failed to read ElasticSearch response ${id} into Image object: ${e.getMessage}")
        Failure(e)
      }
    }.get

    // Round expiration time to try and hit the cache as much as possible
    // TODO: do we really need these expiration tokens? they kill our ability to cache...
    val expiration = roundDateTime(DateTime.now, Duration.standardMinutes(10)).plusMinutes(20)
    val fileUri = new URI((source \ "source" \ "file").as[String])
    val secureUrl = S3Client.signUrl(Config.imageBucket, fileUri, image, expiration)
    val secureThumbUrl = S3Client.signUrl(Config.thumbBucket, fileUri, image, expiration)
    val securePngUrl = S3Client.signUrl(Config.pngBucket, fileUri, image, expiration)

    val validityMap    = ImageExtras.validityMap(image)
    val valid          = ImageExtras.isValid(validityMap)
    val invalidReasons = ImageExtras.invalidReasons(validityMap)

    val persistenceReasons = imagePersistenceReasons(image)
    val isPersisted = persistenceReasons.nonEmpty

    val data = source.transform(addSecureSourceUrl(secureUrl))
      .flatMap(_.transform(wrapUserMetadata(id)))
      .flatMap(_.transform(addSecureThumbUrl(secureThumbUrl)))
      .flatMap((source) => {
        val json: JsValue = source \ "optimisedPng"
        if (source.keys.contains("optimisedPng")) {
          source.transform(addSecureOptimisedPngUrl(securePngUrl))
        } else
          source.transform((__).json.pick)
      })
      .flatMap(_.transform(addValidity(valid)))
      .flatMap(_.transform(addInvalidReasons(invalidReasons)))
      .flatMap(_.transform(addUsageCost(source)))
      .flatMap(_.transform(addPersistedState(isPersisted, persistenceReasons))).get

    val links = imageLinks(id, secureUrl, securePngUrl, withWritePermission, valid)

    val isDeletable = canBeDeleted(image) && withDeletePermission

    val actions = imageActions(id, isDeletable, withWritePermission)

    (data, links, actions)
  }

  def imageLinks(id: String, secureUrl: String, securePngUrl: String, withWritePermission: Boolean, valid: Boolean) = {
    val cropLink = Link("crops", s"${Config.cropperUri}/crops/$id")
    val editLink = Link("edits", s"${Config.metadataUri}/metadata/$id")
    val optimisedLink = Link("optimised", makeImgopsUri(new URI(secureUrl)))
    val optimisedPngLink = Link("optimisedPng", makeImgopsUri(new URI(securePngUrl)))
    val imageLink = Link("ui:image",  s"${Config.kahunaUri}/images/$id")
    val usageLink = Link("usages", s"${Config.usageUri}/usages/media/$id")
    val leasesLink = Link("leases", s"${Config.leaseUri}/leases/media/$id")
    val fileMetadataLink = Link("fileMetadata", s"${Config.rootUri}/images/$id/fileMetadata")

    val baseLinks = if (withWritePermission) {
      List(editLink, optimisedLink, imageLink, usageLink, leasesLink, fileMetadataLink, optimisedPngLink)
    } else {
      List(optimisedLink, imageLink, usageLink, leasesLink, fileMetadataLink, optimisedPngLink)
    }

    if (valid) (cropLink :: baseLinks) else baseLinks
  }

  def imageActions(id: String, isDeletable: Boolean, withWritePermission: Boolean) = {

    val imageUri = URI.create(s"${Config.rootUri}/images/$id")
    val reindexUri = URI.create(s"${Config.rootUri}/images/$id/reindex")
    val addCollectionUri = URI.create(s"${Config.collectionsUri}/images/$id")
    val addLeasesUri = URI.create(s"${Config.leaseUri}/leases")
    val deleteLeasesUri = URI.create(s"${Config.leaseUri}/leases/media/$id")

    val deleteAction = Action("delete", imageUri, "DELETE")
    val reindexAction = Action("reindex", reindexUri, "POST")

    val addCollectionAction = Action("add-collection", addCollectionUri, "POST")

    val addLeasesAction = Action("add-lease", addLeasesUri, "POST")
    val deleteLeasesAction = Action("delete-leases", deleteLeasesUri, "DELETE")

    List(
      deleteAction        -> isDeletable,
      reindexAction       -> withWritePermission,
      addLeasesAction     -> withWritePermission,
      deleteLeasesAction  -> withWritePermission,
      addCollectionAction -> true
    )
    .filter{ case (action, active) => active }
    .map   { case (action, active) => action }
  }

  def addUsageCost(source: JsValue): Reads[JsObject] = {
    // We do the merge here as some records haven't had the user override applied
    // to the root level `usageRights`
    // TODO: Solve with reindex
    val usageRights = List(
      (source \ "usageRights").asOpt[JsObject],
      (source \ "userMetadata" \ "usageRights").asOpt[JsObject]
    ).flatten.foldLeft(Json.obj())(_ ++ _).as[UsageRights]

    val cost = CostCalculator.getCost(usageRights)

    __.json.update(__.read[JsObject].map(_ ++ Json.obj("cost" -> cost.toString)))
  }

  def addPersistedState(isPersisted: Boolean, persistenceReasons: List[String]): Reads[JsObject] =
    __.json.update(__.read[JsObject]).map(_ ++ Json.obj(
      "persisted" -> Json.obj(
        "value" -> isPersisted,
        "reasons" -> persistenceReasons)))

  // FIXME: tidier way to replace a key in a JsObject?
  def wrapUserMetadata(id: String): Reads[JsObject] =
    __.read[JsObject].map { root =>
      val editsJson = (root \ "userMetadata").asOpt[Edits].map { edits =>
        Json.toJson(editsEmbeddedEntity(id, edits))
      }.getOrElse(Json.obj())

      root ++ Json.obj("userMetadata" -> editsJson)
    }

  def addSecureSourceUrl(url: String): Reads[JsObject] =
    (__ \ "source").json.update(__.read[JsObject].map(_ ++ Json.obj("secureUrl" -> url)))

  def addSecureOptimisedPngUrl(url: String): Reads[JsObject] =
    (__ \ "optimisedPng").json.update(__.read[JsObject].map(_ ++ Json.obj("secureUrl" -> url)))

  def addSecureThumbUrl(url: String): Reads[JsObject] =
    (__ \ "thumbnail").json.update(__.read[JsObject].map (_ ++ Json.obj("secureUrl" -> url)))

  def addValidity(valid: Boolean): Reads[JsObject] =
    __.json.update(__.read[JsObject]).map(_ ++ Json.obj("valid" -> valid))

  def addInvalidReasons(reasons: Map[String, String]): Reads[JsObject] =
    __.json.update(__.read[JsObject]).map(_ ++ Json.obj("invalidReasons" -> Json.toJson(reasons)))

  def roundDateTime(t: DateTime, d: Duration) = {
    t minus (t.getMillis - (t.getMillis.toDouble / d.getMillis).round * d.getMillis)
  }

  def makeImgopsUri(uri: URI): String =
    Config.imgopsUri + List(uri.getPath, uri.getRawQuery).mkString("?") + "{&w,h,q}"

  def makeOptimisedPngImageopsUri(uri: URI): String = {
    Config.imgopsUri + List(uri.getPath, uri.getRawQuery).mkString("?") + "{&w, h, q}"
  }

  def imageResponseWrites(id: String, expandFileMetaData: Boolean): Writes[Image] = (
    (__ \ "id").write[String] ~
    (__ \ "uploadTime").write[DateTime] ~
    (__ \ "uploadedBy").write[String] ~
    (__ \ "lastModified").writeNullable[DateTime] ~
    (__ \ "identifiers").write[Map[String,String]] ~
    (__ \ "uploadInfo").write[UploadInfo] ~
    (__ \ "source").write[Asset] ~
    (__ \ "thumbnail").writeNullable[Asset] ~
      (__ \ "optimisedPng").writeNullable[Asset] ~
    (__ \ "fileMetadata").write[FileMetadataEntity]
      .contramap(fileMetadataEntity(id, expandFileMetaData, _: FileMetadata)) ~
    (__ \ "userMetadata").writeNullable[Edits] ~
    (__ \ "metadata").write[ImageMetadata] ~
    (__ \ "originalMetadata").write[ImageMetadata] ~
    (__ \ "usageRights").write[UsageRights] ~
    (__ \ "originalUsageRights").write[UsageRights] ~
    (__ \ "exports").write[List[Export]]
      .contramap((crops: List[Crop]) => crops.map(Export.fromCrop(_:Crop))) ~
    (__ \ "usages").write[UsagesEntity]
      .contramap(usagesEntity(id, _: List[Usage])) ~
    (__ \ "collections").write[List[EmbeddedEntity[CollectionResponse]]]
      .contramap((collections: List[Collection]) => collections.map(c => collectionsEntity(id, c)))
  )(unlift(Image.unapply))

  def fileMetaDataUri(id: String) = URI.create(s"${Config.rootUri}/images/$id/fileMetadata")

  def usagesUri(id: String) = URI.create(s"${Config.usageUri}/usages/media/$id")
  def usageUri(id: String) = {
    URI.create(s"${Config.usageUri}/usages/${UriEncoding.encodePathSegment(id, "UTF-8")}")
  }
  def leasesUri(id: String) = URI.create(s"${Config.rootUri}/leases/media/$id")

  def usageEntity(usage: Usage) = EmbeddedEntity[Usage](usageUri(usage.id), Some(usage))
  def usagesEntity(id: String, usages: List[Usage]) =
    EmbeddedEntity[List[UsageEntity]](usagesUri(id), Some(usages.map(usageEntity)))

  def leasesEntity(id: String, leases: List[MediaLease]) =
    EmbeddedEntity[List[MediaLease]](leasesUri(id), Some(leases))

  def collectionsEntity(id: String, c: Collection): EmbeddedEntity[CollectionResponse] =
      collectionEntity(Config.collectionsUri, id, c)

  def collectionEntity(rootUri: String, imageId: String, c: Collection) = {
    // TODO: Currently the GET for this URI does nothing
    val uri = URI.create(s"$rootUri/images/$imageId/${CollectionsManager.pathToUri(c.path)}")
    val response = CollectionResponse.build(c)
    EmbeddedEntity(uri, Some(response), actions = List(
      Action("remove", uri, "DELETE")
    ))
  }

  def fileMetadataEntity(id: String, expandFileMetaData: Boolean, fileMetadata: FileMetadata) = {
    val displayableMetadata = if(expandFileMetaData) Some(fileMetadata) else None

    EmbeddedEntity[FileMetadata](fileMetaDataUri(id), displayableMetadata)
  }
}

// We're using this to slightly hydrate the json response
case class CollectionResponse private (path: List[String], pathId: String, description: String, cssColour: Option[String], actionData: ActionData)
object CollectionResponse {
  implicit def writes: Writes[CollectionResponse] = Json.writes[CollectionResponse]

  def build(c: Collection) =
    CollectionResponse(c.path, c.pathId, c.description, CollectionsManager.getCssColour(c.path), c.actionData)
}
