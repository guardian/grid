package lib

import com.gu.mediaservice.lib.argo.model._
import com.gu.mediaservice.lib.auth.{Internal, Tier}
import com.gu.mediaservice.lib.collections.CollectionsManager
import com.gu.mediaservice.lib.logging.GridLogging
import com.gu.mediaservice.model._
import com.gu.mediaservice.model.leases.{LeasesByMedia, MediaLease}
import com.gu.mediaservice.model.usage._
import com.softwaremill.quicklens._
import lib.ImageResponse.extractAliasFieldValues
import lib.elasticsearch.SourceWrapper
import lib.usagerights.CostCalculator
import org.joda.time.DateTime
import play.api.libs.functional.syntax._
import play.api.libs.json._
import play.utils.UriEncoding

import java.net.URI
import scala.annotation.tailrec
import scala.util.{Failure, Try}

class ImageResponse(
  config: MediaApiConfig,
  s3Client: S3Client,
  val costCalculatorForTenant: Option[String] => CostCalculator,
) extends EditsResponse with GridLogging {

  implicit val usageQuotas: UsageQuota = costCalculatorForTenant(None).usageQuota

  val metadataBaseUri: String = config.services.metadataBaseUri

  type FileMetadataEntity = EmbeddedEntity[FileMetadata]

  type UsageEntity = EmbeddedEntity[Usage]
  type UsagesEntity = EmbeddedEntity[List[UsageEntity]]

  type MediaLeaseEntity = EmbeddedEntity[MediaLease]
  type MediaLeasesEntity = EmbeddedEntity[LeasesByMedia]

  private val imgPersistenceReasons = ImagePersistenceReasons(config.persistedRootCollections, config.persistenceIdentifier)

  def imagePersistenceReasons(image: Image): List[String] = imgPersistenceReasons.reasons(image)

  def canBeDeleted(image: Image) = image.canBeDeleted

  def create(
    id: String,
    imageWrapper: SourceWrapper[Image],
    withWritePermission: Boolean,
    withDeleteImagePermission: Boolean,
    withDeleteCropsOrUsagePermission: Boolean,
    included: List[String] = List(),
    tier: Tier,
    costCalculator: CostCalculator
  ): (JsValue, List[Link], List[Action]) = {

    val image = imageWrapper.instance

    val source = Try {
      Json.toJson(image)(imageResponseWrites(image.id, included.contains("fileMetadata")))
    }.recoverWith {
      case e =>
        logger.error(s"Failed to read ElasticSearch response $id into Image object: ${e.getMessage}")
        Failure(e)
    }.get

    val pngFileUri = image.optimisedPng.map(_.file)

    val fileUri = image.source.file

    val imageUrl = s3Client.signUrl(config.imageBucket, fileUri, image, imageType = Source)
    val pngUrl: Option[String] = pngFileUri
      .map(s3Client.signUrl(config.imageBucket, _, image, imageType = OptimisedPng))

    def s3SignedThumbUrl = s3Client.signUrl(config.thumbBucket, fileUri, image, imageType = Thumbnail)

    val thumbUrl = config.cloudFrontDomainThumbBucket
      .flatMap(s3Client.signedCloudFrontUrl(_, fileUri.getPath.drop(1)))
      .getOrElse(s3SignedThumbUrl)

    val validityMap = ImageExtras.validityMap(image, withWritePermission)(costCalculator)
    val valid = ImageExtras.isValid(validityMap)
    val invalidReasons = ImageExtras.invalidReasons(validityMap, config.customValidityDescription)

    val downloadableMap = ImageExtras.downloadableMap(image, withWritePermission)(costCalculator)
    val isDownloadable = ImageExtras.isValid(downloadableMap)


    val persistenceReasons = imagePersistenceReasons(image)
    val isPersisted = persistenceReasons.nonEmpty

    val aliases = extractAliasFieldValues(config, imageWrapper)

    val data = source.transform(addSecureSourceUrl(imageUrl))
      .flatMap(_.transform(wrapUserMetadata(id)))
      .flatMap(_.transform(addSecureThumbUrl(thumbUrl)))
      .flatMap(_.transform(
        pngUrl
          .map(url => addSecureOptimisedPngUrl(url))
          .getOrElse(__.json.pick)
      ))
      .flatMap(_.transform(addValidity(valid)))
      .flatMap(_.transform(addInvalidReasons(invalidReasons)))
      .flatMap(_.transform(addUsageCost(source, costCalculator)))
      .flatMap(_.transform(addPersistedState(isPersisted, persistenceReasons)))
      .flatMap(_.transform(addSyndicationStatus(image)))
      .flatMap(_.transform(addAliases(aliases)))
      .flatMap(_.transform(addFromIndex(imageWrapper.fromIndex))).get

    val links: List[Link] = tier match {
      case Internal => imageLinks(id, imageUrl, pngUrl, withWritePermission, valid) ++ getDownloadLinks(id, isDownloadable)
      case _ => List(downloadLink(id), downloadOptimisedLink(id))
    }

    val isDeletable = canBeDeleted(image) && withDeleteImagePermission

    val actions: List[Action] = if (tier == Internal) imageActions(id, isDeletable, withWritePermission, withDeleteCropsOrUsagePermission) else Nil

    (data, links, actions)
  }

  private def downloadLink(id: String) = Link("download", s"${config.rootUri}/images/$id/download")
  private def downloadOptimisedLink(id: String) = Link("downloadOptimised", s"${config.rootUri}/images/$id/downloadOptimised?{&width,height,quality}")


  private def getDownloadLinks(id: String, isDownloadable: Boolean): List[Link] = {
    (config.restrictDownload, isDownloadable) match {
      case (true, false) => Nil
      case (_, _) => List(downloadLink(id), downloadOptimisedLink(id))
    }
  }

  def imageLinks(id: String, secureUrl: String, securePngUrl: Option[String], withWritePermission: Boolean, valid: Boolean): List[Link] = {
    import BoolImplicitMagic.BoolToOption
    val cropLinkMaybe = valid.toOption(Link("crops", s"${config.cropperUri}/crops/$id"))
    val editLinkMaybe = withWritePermission.toOption(Link("edits", s"${config.metadataUri}/metadata/$id"))
    val optimisedPngLinkMaybe = securePngUrl map { case secureUrl => Link("optimisedPng", makeImgopsUri(new URI(secureUrl))) }

    val optimisedLink = Link("optimised", makeImgopsUri(new URI(secureUrl)))
    val imageLink = Link("ui:image", s"${config.kahunaUri}/images/$id")
    val usageLink = Link("usages", s"${config.usageUri}/usages/media/$id")
    val leasesLink = Link("leases", s"${config.leasesUri}/leases/media/$id")
    val fileMetadataLink = Link("fileMetadata", s"${config.rootUri}/images/$id/fileMetadata")
    val projectionLink = Link("loader", s"${config.loaderUri}/images/project/$id")
    val projectionDiffLink = Link("api", s"${config.rootUri}/images/$id/projection/diff")

    editLinkMaybe.toList ++ cropLinkMaybe.toList ++ optimisedPngLinkMaybe.toList ++
      List(
        optimisedLink, imageLink, usageLink, leasesLink, fileMetadataLink,
        projectionLink, projectionDiffLink)
  }

  def imageActions(id: String, isDeletable: Boolean, withWritePermission: Boolean, withDeleteCropsOrUsagePermission: Boolean): List[Action] = {

    val imageUri = URI.create(s"${config.rootUri}/images/$id")
    val reindexUri = URI.create(s"${config.rootUri}/images/$id/reindex")
    val addCollectionUri = URI.create(s"${config.collectionsUri}/images/$id")
    val addLeasesUri = URI.create(s"${config.leasesUri}/leases")
    val replaceLeasesUri = URI.create(s"${config.leasesUri}/leases/media/$id")
    val deleteLeasesUri = URI.create(s"${config.leasesUri}/leases/media/$id")
    val deleteUsagesUri = URI.create(s"${config.usageUri}/usages/media/$id")

    val deleteAction = Action("delete", imageUri, "DELETE")
    val reindexAction = Action("reindex", reindexUri, "POST")

    val addCollectionAction = Action("add-collection", addCollectionUri, "POST")

    val addLeasesAction = Action("add-lease", addLeasesUri, "POST")
    val replaceLeasesAction = Action("replace-leases", replaceLeasesUri, "POST")
    val deleteLeasesAction = Action("delete-leases", deleteLeasesUri, "DELETE")
    val deleteUsagesAction = Action("delete-usages", deleteUsagesUri, "DELETE")

    List(
      deleteAction -> isDeletable,
      reindexAction -> withWritePermission,
      addLeasesAction -> withWritePermission,
      replaceLeasesAction -> withWritePermission,
      deleteLeasesAction -> withWritePermission,
      deleteUsagesAction -> withDeleteCropsOrUsagePermission,
      addCollectionAction -> true
    )
      .filter { case (action, active) => active }
      .map { case (action, active) => action }
  }

  def addUsageCost(source: JsValue, costCalculator: CostCalculator): Reads[JsObject] = {
    // We do the merge here as some records haven't had the user override applied
    // to the root level `usageRights`
    // TODO: Solve with reindex
    val usageRights = List(
      (source \ "usageRights").asOpt[JsObject],
      (source \ "userMetadata" \ "usageRights").asOpt[JsObject]
    ).flatten.foldLeft(Json.obj())(_ ++ _).as[UsageRights]

    val cost = costCalculator.getCost(usageRights)

    __.json.update(__.read[JsObject].map(_ ++ Json.obj("cost" -> cost.toString)))
  }

  def addSyndicationStatus(image: Image): Reads[JsObject] = {
    __.json.update(__.read[JsObject]).map(_ ++ Json.obj(
      "syndicationStatus" -> image.syndicationStatus
    ))
  }

  def addPersistedState(isPersisted: Boolean, persistenceReasons: List[String]): Reads[JsObject] =
    __.json.update(__.read[JsObject]).map(_ ++ Json.obj(
      "persisted" -> Json.obj(
        "value" -> isPersisted,
        "reasons" -> persistenceReasons)))

  def wrapUserMetadata(id: String): Reads[JsObject] =
    __.read[JsObject].map { root =>
      val edits = (root \ "userMetadata").asOpt[Edits].getOrElse(Edits.getEmpty)
      val editsJson = Json.toJson(editsEmbeddedEntity(id, edits))

      root ++ Json.obj("userMetadata" -> editsJson)
    }

  def addSecureSourceUrl(url: String): Reads[JsObject] =
    (__ \ "source").json.update(__.read[JsObject].map(_ ++ Json.obj("secureUrl" -> url)))

  def addSecureOptimisedPngUrl(url: String): Reads[JsObject] =
    (__ \ "optimisedPng").json.update(__.read[JsObject].map(_ ++ Json.obj("secureUrl" -> url)))

  def addSecureThumbUrl(url: String): Reads[JsObject] =
    (__ \ "thumbnail").json.update(__.read[JsObject].map(_ ++ Json.obj("secureUrl" -> url)))

  def addValidity(valid: Boolean): Reads[JsObject] =
    __.json.update(__.read[JsObject]).map(_ ++ Json.obj("valid" -> valid))

  def addFromIndex(fromIndex: String): Reads[JsObject] =
    __.json.update(__.read[JsObject]).map(_ ++ Json.obj("fromIndex" -> fromIndex))

  def addInvalidReasons(reasons: Map[String, String]): Reads[JsObject] =
    __.json.update(__.read[JsObject]).map(_ ++ Json.obj("invalidReasons" -> Json.toJson(reasons)))

  def addAliases(aliases: Seq[(String, JsValue)]): Reads[JsObject] =
    __.json.update(__.read[JsObject]).map(_ ++ Json.obj(
      "aliases" -> JsObject(aliases)
    ))

  def makeImgopsUri(uri: URI): String =
    config.imgopsUri + List(uri.getPath, uri.getRawQuery).mkString("?") + "{&w,h,q}"

  def makeOptimisedPngImageopsUri(uri: URI): String = {
    config.imgopsUri + List(uri.getPath, uri.getRawQuery).mkString("?") + "{&w, h, q}"
  }

  import play.api.libs.json.JodaWrites._

  def imageResponseWrites(id: String, expandFileMetaData: Boolean): Writes[Image] = (
    (__ \ "id").write[String] ~
      (__ \ "uploadTime").write[DateTime] ~
      (__ \ "uploadedBy").write[String] ~
      (__ \ "softDeletedMetadata").writeNullable[SoftDeletedMetadata] ~
      (__ \ "lastModified").writeNullable[DateTime] ~
      (__ \ "identifiers").write[Map[String, String]] ~
      (__ \ "uploadInfo").write[UploadInfo] ~
      (__ \ "source").write[Asset] ~
      (__ \ "thumbnail").writeNullable[Asset] ~
      (__ \ "optimisedPng").writeNullable[Asset] ~
      (__ \ "fileMetadata").write[FileMetadataEntity]
        .contramap(fileMetadataEntity(id, expandFileMetaData, _: FileMetadata)) ~
      (__ \ "userMetadata").writeNullable[Edits] ~
      (__ \ "metadata").write[ImageMetadata](ImageResponse.newlineNormalisingImageMetadataWriter) ~
      (__ \ "originalMetadata").write[ImageMetadata] ~
      (__ \ "usageRights").write[UsageRights] ~
      (__ \ "originalUsageRights").write[UsageRights] ~
      (__ \ "exports").write[List[Export]]
        .contramap((crops: List[Crop]) => crops.map(Export.fromCrop(_: Crop))) ~
      (__ \ "usages").write[UsagesEntity]
        .contramap(usagesEntity(id, _: List[Usage])) ~
      (__ \ "leases").write[MediaLeasesEntity]
        .contramap(leasesEntity(id, _: LeasesByMedia)) ~
      (__ \ "collections").write[List[EmbeddedEntity[CollectionResponse]]]
        .contramap((collections: List[Collection]) => collections.map(c => collectionsEntity(id, c))) ~
      (__ \ "syndicationRights").writeNullable[SyndicationRights] ~
      (__ \ "usermetaDataLastModified").writeNullable[DateTime]

    ) (unlift(Image.unapply))

  def fileMetaDataUri(id: String) = URI.create(s"${config.rootUri}/images/$id/fileMetadata")

  def usagesUri(id: String) = URI.create(s"${config.usageUri}/usages/media/$id")

  def usageUri(id: String) = {
    URI.create(s"${config.usageUri}/usages/${UriEncoding.encodePathSegment(id, "UTF-8")}")
  }

  def leasesUri(id: String) = URI.create(s"${config.leasesUri}/leases/media/$id")

  def usageEntity(usage: Usage) = EmbeddedEntity[Usage](usageUri(usage.id), Some(usage))

  def usagesEntity(id: String, usages: List[Usage]) =
    EmbeddedEntity[List[UsageEntity]](usagesUri(id), Some(usages.map(usageEntity)))

  def leasesEntity(id: String, leaseByMedia: LeasesByMedia) =
    EmbeddedEntity[LeasesByMedia](leasesUri(id), Some(leaseByMedia))

  def collectionsEntity(id: String, c: Collection): EmbeddedEntity[CollectionResponse] =
    collectionEntity(config.collectionsUri, id, c)

  def collectionEntity(rootUri: String, imageId: String, c: Collection) = {
    // TODO: Currently the GET for this URI does nothing
    val uri = URI.create(s"$rootUri/images/$imageId/${CollectionsManager.pathToUri(c.path)}")
    val response = CollectionResponse.build(c)
    EmbeddedEntity(uri, Some(response), actions = List(
      Action("remove", uri, "DELETE")
    ))
  }

  def fileMetadataEntity(id: String, expandFileMetaData: Boolean, fileMetadata: FileMetadata) = {
    val displayableMetadata = if (expandFileMetaData) Some(fileMetadata) else None

    EmbeddedEntity[FileMetadata](fileMetaDataUri(id), displayableMetadata)
  }
}

object ImageResponse {

  val newlineNormalisingImageMetadataWriter: Writes[ImageMetadata] = (input: ImageMetadata) => {
    Json.toJson(normaliseNewLinesInImageMeta(input))
  }

  def normaliseNewLinesInImageMeta(imageMetadata: ImageMetadata): ImageMetadata = imageMetadata.modifyAll(
    _.description,
    _.copyright,
    _.specialInstructions,
    _.suppliersReference
  ).using(_.map(ImageResponse.normaliseNewlineChars))

  private val pattern = """[\r\n]+""".r

  def normaliseNewlineChars(string: String): String = pattern.replaceAllIn(string, "\n")

  def canImgBeDeleted(image: Image) = !hasExports(image) && !hasUsages(image)

  private def hasExports(image: Image) = image.exports.nonEmpty

  private def hasUsages(image: Image) = image.usages.nonEmpty

  def extractAliasFieldValues(config: MediaApiConfig, source: SourceWrapper[Image]): Seq[(String, JsValue)] = {
    @tailrec
    def nestedLookup(jsLookup: JsLookupResult, pathComponents: List[String]): JsLookupResult = {
      pathComponents match {
        case Nil => jsLookup
        case head :: tail => nestedLookup(jsLookup \ head, tail)
      }
    }

    config.fieldAliasConfigs.flatMap { config =>
      val parts = config.elasticsearchPath.split('.').toList.filter(_.nonEmpty)
      val lookupResult = nestedLookup(JsDefined(source.source), parts)
      lookupResult.toOption.map {
        config.alias -> _
      }
    }
  }
}

// We're using this to slightly hydrate the json response
case class CollectionResponse private(path: List[String], pathId: String, description: String, cssColour: Option[String], actionData: ActionData)

object CollectionResponse {
  implicit def writes: Writes[CollectionResponse] = Json.writes[CollectionResponse]

  def build(c: Collection) =
    CollectionResponse(c.path, c.pathId, c.description, CollectionsManager.getCssColour(c.path), c.actionData)
}

object BoolImplicitMagic {
  // This functionality is a member of Option in scala 2.13
  implicit class BoolToOption(val self: Boolean) extends AnyVal {
    def toOption[A](value: => A): Option[A] = if (self) Some(value) else None
  }
}
