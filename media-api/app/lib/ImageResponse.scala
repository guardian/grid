package lib

import com.gu.mediaservice.lib.argo.model._
import com.gu.mediaservice.lib.auth.{Internal, Tier}
import com.gu.mediaservice.lib.collections.CollectionsManager
import com.gu.mediaservice.lib.logging.GridLogging
import com.gu.mediaservice.model._
import com.gu.mediaservice.model.leases.{LeasesByMedia, MediaLease}
import com.gu.mediaservice.model.usage._
import lib.ImageResponse.extractAliasFieldValues
import lib.elasticsearch.SourceWrapper
import lib.usagerights.CostCalculator
import org.apache.commons.codec.binary.Base64
import org.joda.time.DateTime
import play.api.libs.functional.syntax._
import play.api.libs.json._
import play.utils.UriEncoding

import java.net.{URI, URLEncoder}
import scala.annotation.tailrec
import scala.util.{Failure, Try}

class ImageResponse(config: MediaApiConfig, s3Client: S3Client, usageQuota: UsageQuota)
  extends EditsResponse with GridLogging {

  implicit val usageQuotas: UsageQuota = usageQuota

  object Costing extends CostCalculator {
    override val freeSuppliers: List[String] = config.usageRightsConfig.freeSuppliers
    override val suppliersCollectionExcl: Map[String, List[String]] = config.usageRightsConfig.suppliersCollectionExcl
    val quotas = usageQuotas
  }

  val customSpecialInstructions: Map[String, String] = config.customSpecialInstructions
  val customUsageRestrictions: Map[String, String] = config.customUsageRestrictions

  implicit val costing: CostCalculator = Costing

  val metadataBaseUri: String = config.services.metadataBaseUri

  type FileMetadataEntity = EmbeddedEntity[FileMetadata]

  type UsageEntity = EmbeddedEntity[Usage]
  type UsagesEntity = EmbeddedEntity[List[UsageEntity]]

  type MediaLeaseEntity = EmbeddedEntity[MediaLease]
  type MediaLeasesEntity = EmbeddedEntity[LeasesByMedia]

  private val imgPersistenceReasons = ImagePersistenceReasons(
    config.maybePersistOnlyTheseCollections,
    config.persistenceIdentifier
  )

  def imagePersistenceReasons(image: Image): List[String] = imgPersistenceReasons.reasons(image)

  def canBeDeleted(image: Image) = image.canBeDeleted

  def create(
              id: String,
              imageWrapper: SourceWrapper[Image],
              withWritePermission: Boolean,
              withDeleteImagePermission: Boolean,
              withDeleteCropsOrUsagePermission: Boolean,
              included: List[String] = List(), tier: Tier)(implicit instance: Instance): (JsValue, List[Link], List[Action]) = {
    val image = imageWrapper.instance

    val source = Try {
      Json.toJsObject(image)(imageResponseWrites(image.id, included.contains("fileMetadata"))) ++ imageWrapper.fields
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

    val validityMap = checkUsageRestrictions(source, ImageExtras.validityMap(image, withWritePermission))
    val valid = ImageExtras.isValid(validityMap)
    val invalidReasons = ImageExtras.invalidReasons(validityMap, config.customValidityDescription)

    val downloadableMap = checkDownloadRestrictions(source, ImageExtras.downloadableMap(image, withWritePermission), withWritePermission)
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
      .flatMap(_.transform(addUsageCost(source)))
      .flatMap(_.transform(addPersistedState(isPersisted, persistenceReasons)))
      .flatMap(_.transform(addSyndicationStatus(image)))
      .flatMap(_.transform(addAliases(aliases)))
      .flatMap(_.transform(addFromIndex(imageWrapper.fromIndex)))
      .flatMap(_.transform(updateCustomSpecialInstructions(source)))
      .flatMap(_.transform(updateCustomUsageRestrictions(source)))
      .get

    val links: List[Link] = tier match {
      case Internal => imageLinks(id, imageUrl, pngUrl, withWritePermission, valid, image.source.orientationMetadata) ++ getDownloadLinks(id, isDownloadable)
      case _ => List(downloadLink(id), downloadOptimisedLink(id))
    }

    val isDeletable = canBeDeleted(image) && withDeleteImagePermission

    val actions: List[Action] = if (tier == Internal) imageActions(id, isDeletable, withWritePermission, withDeleteCropsOrUsagePermission) else Nil

    (data, links, actions)
  }

  private def downloadLink(id: String)(implicit instance: Instance) = Link("download", s"${config.rootUri(instance)}/images/$id/download")
  private def downloadOptimisedLink(id: String)(implicit instance: Instance)  = Link("downloadOptimised", s"${config.rootUri(instance)}/images/$id/downloadOptimised?{&width,height,quality}")


  private def getDownloadLinks(id: String, isDownloadable: Boolean)(implicit instance: Instance): List[Link] = {
    (config.restrictDownload, isDownloadable) match {
      case (true, false) => Nil
      case (_, _) => List(downloadLink(id)(instance), downloadOptimisedLink(id)(instance))
    }
  }

  def imageLinks(id: String, secureUrl: String, securePngUrl: Option[String], withWritePermission: Boolean, valid: Boolean, orientationMetadata: Option[OrientationMetadata])(implicit instance: Instance): List[Link] = {
    import BoolImplicitMagic.BoolToOption
    val cropLinkMaybe = valid.toOption(Link("crops", s"${config.cropperUri}/crops/$id"))
    val editLinkMaybe = withWritePermission.toOption(Link("edits", s"${config.metadataUri}/metadata/$id"))
    val optimisedPngLinkMaybe = securePngUrl map { case secureUrl => Link("optimisedPng", makeImgProxyUri(new URI(secureUrl), orientationMetadata)) }

    val optimisedLink = Link("optimised", makeImgProxyUri(new URI(secureUrl), orientationMetadata))
    val imageLink = Link("ui:image", s"${config.kahunaUri}/images/$id")
    val usageLink = Link("usages", s"${config.usageUri}/usages/media/$id")
    val leasesLink = Link("leases", s"${config.leasesUri}/leases/media/$id")
    val fileMetadataLink = Link("fileMetadata", s"${config.rootUri(instance)}/images/$id/fileMetadata")
    val projectionLink = Link("loader", s"${config.loaderUri}/images/project/$id")
    val projectionDiffLink = Link("api", s"${config.rootUri(instance)}/images/$id/projection/diff")

    editLinkMaybe.toList ++ cropLinkMaybe.toList ++ optimisedPngLinkMaybe.toList ++
      List(
        optimisedLink, imageLink, usageLink, leasesLink, fileMetadataLink,
        projectionLink, projectionDiffLink)
  }

  def imageActions(id: String, isDeletable: Boolean, withWritePermission: Boolean, withDeleteCropsOrUsagePermission: Boolean)(implicit instance: Instance): List[Action] = {

    val imageUri = URI.create(s"${config.rootUri(instance)}/images/$id")
    val reindexUri = URI.create(s"${config.rootUri(instance)}/images/$id/reindex")
    val addCollectionUri = URI.create(s"${config.collectionsUri}/images/$id")
    val addLeaseUri = URI.create(s"${config.leasesUri}/leases")
    val addLeasesUri = URI.create(s"${config.leasesUri}/leases/media/$id")
    val replaceLeasesUri = URI.create(s"${config.leasesUri}/leases/media/$id")
    val deleteLeasesUri = URI.create(s"${config.leasesUri}/leases/media/$id")
    val deleteUsagesUri = URI.create(s"${config.usageUri}/usages/media/$id")

    val deleteAction = Action("delete", imageUri, "DELETE")
    val reindexAction = Action("reindex", reindexUri, "POST")

    val addCollectionAction = Action("add-collection", addCollectionUri, "POST")

    val addLeaseAction = Action("add-lease", addLeaseUri, "POST")
    val addLeasesAction = Action("add-leases", addLeasesUri, "POST")
    val replaceLeasesAction = Action("replace-leases", replaceLeasesUri, "PUT")
    val deleteLeasesAction = Action("delete-leases", deleteLeasesUri, "DELETE")
    val deleteUsagesAction = Action("delete-usages", deleteUsagesUri, "DELETE")

    List(
      deleteAction -> isDeletable,
      reindexAction -> withWritePermission,
      addLeaseAction -> withWritePermission,
      addLeasesAction -> withWritePermission,
      replaceLeasesAction -> withWritePermission,
      deleteLeasesAction -> withWritePermission,
      deleteUsagesAction -> withDeleteCropsOrUsagePermission,
      addCollectionAction -> true
    )
      .filter { case (action, active) => active }
      .map { case (action, active) => action }
  }

  def addUsageCost(source: JsValue): Reads[JsObject] = {
    // We do the merge here as some records haven't had the user override applied
    // to the root level `usageRights`
    // TODO: Solve with reindex
    val usageRights = List(
      (source \ "usageRights").asOpt[JsObject],
      (source \ "userMetadata" \ "usageRights").asOpt[JsObject]
    ).flatten.foldLeft(Json.obj())(_ ++ _).as[UsageRights]

    val cost = Costing.getCost(usageRights)

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

  private def makeImgProxyUri(uri: URI, orientationMetadata: Option[OrientationMetadata]): String = {
    def normaliseRotation(rotation: Int) = {
      // imgproxy does not accept negative rotations
      if (rotation < 0) {
        rotation + 360
      } else {
        rotation
      }
    }
    val base64EncodedSourceURL = new String(Base64.encodeBase64URLSafe(uri.toURL.toExternalForm.getBytes), "UTF-8")
    val resizing = Seq(config.imgopsUri, "no-signature",
      "auto_rotate:false", "strip_metadata:true", "strip_color_profile:true",
      "resize:fit:{w}:{h}", "quality:{q}")
    val orientationCorrection = orientationMetadata.map(o => Seq("rotate:" + normaliseRotation(o.orientationCorrection()))).getOrElse(Seq.empty)
    val pathComponents = resizing ++ orientationCorrection :+ base64EncodedSourceURL
    pathComponents.mkString("/")
  }

  private def updateCustomSpecialInstructions(source: JsValue): Reads[JsObject] = {
     (source \ "usageRights" \ "category") match {
        case JsDefined(category) =>
          if (customSpecialInstructions.contains(category.as[String])) {
            (__ \ "metadata").json.update(__.read[JsObject].map(_ ++ Json.obj(("usageInstructions") -> customSpecialInstructions.get(category.as[String]))))
          } else {
            __.json.update(__.read[JsObject])
          }
        case _ => __.json.update(__.read[JsObject])
      }
  }

  private def updateCustomUsageRestrictions(source: JsValue): Reads[JsObject] = {
    (source \ "usageRights" \ "category") match {
      case JsDefined(category) =>
        if (customUsageRestrictions.contains(category.as[String])) {
          (__ \ "usageRights").json.update(__.read[JsObject].map(_ ++ Json.obj(("usageRestrictions") -> customUsageRestrictions.get(category.as[String]))))
        } else {
          __.json.update(__.read[JsObject])
        }
      case _ => __.json.update(__.read[JsObject])
    }
  }

  private def checkUsageRestrictions(source: JsValue, validityMap: Map[String, ValidityCheck]) : Map[String, ValidityCheck] = {
    (source \ "usageRights" \ "category") match {
      case JsDefined(category) =>
        if (customUsageRestrictions.contains(category.as[String])) {
          validityMap.updated("conditional_paid", ValidityCheck(true, validityMap("conditional_paid").overrideable, validityMap("conditional_paid").shouldOverride))
        } else {
          validityMap
        }
      case _ => validityMap
    }
  }

  private def checkDownloadRestrictions(source: JsValue, validityMap: Map[String, ValidityCheck], writePermissions: Boolean) : Map[String, ValidityCheck] = {
    (source \ "usageRights" \ "category") match {
      case JsDefined(category) =>
        if (customUsageRestrictions.contains(category.as[String]) && !writePermissions) {
          validityMap.updated("conditional_paid", ValidityCheck(true, validityMap("conditional_paid").overrideable, validityMap("conditional_paid").shouldOverride))
                     .updated("paid_image", ValidityCheck(true, validityMap("paid_image").overrideable, validityMap("paid_image").shouldOverride))
        } else {
          validityMap
        }
      case _ => validityMap
    }
  }

  import play.api.libs.json.JodaWrites._

  def imageResponseWrites(id: String, expandFileMetaData: Boolean)(implicit instance: Instance): OWrites[Image] = (
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

  def fileMetaDataUri(id: String)(implicit instance: Instance) = URI.create(s"${config.rootUri(instance)}/images/$id/fileMetadata")

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

  def fileMetadataEntity(id: String, expandFileMetaData: Boolean, fileMetadata: FileMetadata)(implicit instance: Instance) = {
    val displayableMetadata = if (expandFileMetaData) Some(fileMetadata) else None

    EmbeddedEntity[FileMetadata](fileMetaDataUri(id)(instance), displayableMetadata)
  }
}

object ImageResponse {

  val newlineNormalisingImageMetadataWriter: Writes[ImageMetadata] = (input: ImageMetadata) => {
    Json.toJson(normaliseNewLinesInImageMeta(input))
  }

  def normaliseNewLinesInImageMeta(imageMetadata: ImageMetadata): ImageMetadata = imageMetadata.copy(
    description = imageMetadata.description.map(ImageResponse.normaliseNewlineChars),
    copyright = imageMetadata.copyright.map(ImageResponse.normaliseNewlineChars),
    specialInstructions = imageMetadata.specialInstructions.map(ImageResponse.normaliseNewlineChars),
    suppliersReference = imageMetadata.suppliersReference.map(ImageResponse.normaliseNewlineChars),
  )

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
