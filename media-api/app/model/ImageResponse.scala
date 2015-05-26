package model

import org.joda.time.{DateTime, Duration}

import lib.{Config, S3Client}

import com.gu.mediaservice.model.{DateFormat, Asset, ImageMetadata, UsageRights, Crop, FileMetadata, Edits}
import com.gu.mediaservice.lib.argo.model.{EmbeddedEntity, Link}
import com.gu.mediaservice.model.{Cost, Pay, Free, Image, ImageUsageRights}
import com.gu.mediaservice.api.Transformers

import java.net.{URLEncoder, URI}

import play.api.libs.json._
import play.api.libs.functional.syntax._


object ImageResponse {
  implicit val dateTimeFormat = DateFormat

  val commonTransformers = new Transformers(Config.services)

  type FileMetadataEntity = EmbeddedEntity[FileMetadata]

  def fileMetaDataUri(id: String) = URI.create(s"${Config.rootUri}/images/$id/fileMetadata")

  def create(id: String, esSource: JsValue, withWritePermission: Boolean): (JsValue, List[Link]) = {

    val image = esSource.as[Image]
    val source = Json.toJson(image)(imageResponseWrites(image.id))

    // Round expiration time to try and hit the cache as much as possible
    // TODO: do we really need these expiration tokens? they kill our ability to cache...
    val expiration = roundDateTime(DateTime.now, Duration.standardMinutes(10)).plusMinutes(20)
    val fileUri = new URI((source \ "source" \ "file").as[String])
    val secureUrl = S3Client.signUrl(Config.imageBucket, fileUri, expiration)
    val secureThumbUrl = S3Client.signUrl(Config.thumbBucket, fileUri, expiration)

    val creditField = (source \ "metadata" \ "credit").as[Option[String]]
    val sourceField = (source \ "metadata" \ "source").as[Option[String]]
    val supplierField     = (source \ "usageRights" \ "supplier").asOpt[String]
    val supplierCollField = (source \ "usageRights" \ "suppliersCollection").asOpt[String]
    val usageRightsField = (source \ "userMetadata" \ "usageRights").asOpt[UsageRights]
    val valid = ImageExtras.isValid(source \ "metadata")

    val data = source.transform(addSecureSourceUrl(secureUrl))
      .flatMap(_.transform(wrapUserMetadata(id)))
      .flatMap(_.transform(addSecureThumbUrl(secureThumbUrl)))
      .flatMap(_.transform(addValidity(valid)))
      .flatMap(_.transform(addUsageCost(creditField, sourceField, supplierField, supplierCollField, usageRightsField))).get

    val links = imageLinks(id, secureUrl, withWritePermission, valid)

    (data, links)
  }

  def imageLinks(id: String, secureUrl: String, withWritePermission: Boolean, valid: Boolean) = {
    val cropLink = Link("crops", s"${Config.cropperUri}/crops/$id")
    val editLink = Link("edits", s"${Config.metadataUri}/metadata/$id")
    val optimisedLink = Link("optimised", makeImgopsUri(new URI(secureUrl)))
    val imageLink = Link("ui:image",  s"${Config.kahunaUri}/images/$id")

    val baseLinks = if (withWritePermission) {
      List(editLink, optimisedLink, imageLink)
    } else {
      List(optimisedLink, imageLink)
    }

    if (valid) (cropLink :: baseLinks) else baseLinks
  }

  def addUsageCost(credit: Option[String], source: Option[String], supplier: Option[String],
    supplierColl: Option[String], usageRights: Option[UsageRights]): Reads[JsObject] = {
      val cost = ImageExtras.getCost(credit, source, supplier, supplierColl, usageRights)
      __.json.update(__.read[JsObject].map(_ ++ Json.obj("cost" -> cost.toString)))
  }

  def removeFileData: Reads[JsObject] =
    (__ \ "fileMetadata").json.prune

  // FIXME: tidier way to replace a key in a JsObject?
  def wrapUserMetadata(id: String): Reads[JsObject] =
    __.read[JsObject].map { root =>
      val userMetadata = commonTransformers.objectOrEmpty(root \ "userMetadata")
      val wrappedUserMetadata = userMetadata.transform(commonTransformers.wrapAllMetadata(id)).get
      root ++ Json.obj("userMetadata" -> wrappedUserMetadata)
    }

  def addSecureSourceUrl(url: String): Reads[JsObject] =
    (__ \ "source").json.update(__.read[JsObject].map(_ ++ Json.obj("secureUrl" -> url)))

  def addSecureThumbUrl(url: String): Reads[JsObject] =
    (__ \ "thumbnail").json.update(__.read[JsObject].map (_ ++ Json.obj("secureUrl" -> url)))

  def addValidity(valid: Boolean): Reads[JsObject] =
    __.json.update(__.read[JsObject]).map(_ ++ Json.obj("valid" -> valid))

  def roundDateTime(t: DateTime, d: Duration) = {
    t minus (t.getMillis - (t.getMillis.toDouble / d.getMillis).round * d.getMillis)
  }

  def makeImgopsUri(uri: URI): String =
    Config.imgopsUri + List(uri.getPath, uri.getRawQuery).mkString("?") + "{&w,h,q}"

  def imageResponseWrites(id: String): Writes[Image] = (
    (__ \ "id").write[String] ~
    (__ \ "uploadTime").write[DateTime] ~
    (__ \ "uploadedBy").write[String] ~
    (__ \ "lastModified").writeNullable[DateTime] ~
    (__ \ "identifiers").write[Map[String,String]] ~
    (__ \ "source").write[Asset] ~
    (__ \ "thumbnail").writeNullable[Asset] ~
    (__ \ "fileMetadata").write[FileMetadataEntity].contramap(fileMetadataEntity(id, _: FileMetadata)) ~
    (__ \ "userMetadata").writeNullable[Edits] ~
    (__ \ "metadata").write[ImageMetadata] ~
    (__ \ "originalMetadata").write[ImageMetadata] ~
    (__ \ "usageRights").write[ImageUsageRights] ~
    (__ \ "originalUsageRights").write[ImageUsageRights] ~
    (__ \ "exports").writeNullable[List[Crop]]
  )(unlift(Image.unapply))

  def fileMetadataEntity(id: String, fileMetadata: FileMetadata) =
    EmbeddedEntity[FileMetadata](fileMetaDataUri(id), Some(fileMetadata))
}

object ImageExtras {
  def isValid(metadata: JsValue): Boolean =
    Config.requiredMetadata.forall(field => (metadata \ field).asOpt[String].isDefined)

  def getCost(credit: Option[String], source: Option[String], supplier: Option[String], supplierColl: Option[String],
              usageRights: Option[UsageRights]): Cost = {
    val freeCredit      = credit.exists(isFreeCredit)
    val freeSource      = source.exists(isFreeSource)
    val payingSource    = source.exists(isPaySource)
    val freeCreditOrSource = (freeCredit || freeSource) && ! payingSource

    val freeSupplier    = supplier.exists { suppl =>
      isFreeSupplier(suppl) && ! supplierColl.exists(isExcludedColl(suppl, _))
    }

    usageRights.map(_.cost).getOrElse {
      if (freeCreditOrSource || freeSupplier) Free
      else Pay
    }
  }

  private def isFreeCredit(credit: String) = Config.freeCreditList.contains(credit)
  private def isFreeSource(source: String) = Config.freeSourceList.contains(source)
  private def isPaySource(source: String)  = Config.payGettySourceList.contains(source)

  private def isFreeSupplier(supplier: String) = Config.freeSuppliers.contains(supplier)
  private def isExcludedColl(supplier: String, supplierColl: String) =
    Config.suppliersCollectionExcl.get(supplier).exists(_.contains(supplierColl))
}
