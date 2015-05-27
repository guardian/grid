package lib

import java.net.{URLEncoder, URI}

import play.api.libs.json._
import play.api.libs.functional.syntax._

import org.joda.time.{DateTime, Duration}

import com.gu.mediaservice.model._
import com.gu.mediaservice.lib.argo.model.{EmbeddedEntity, Link}
import com.gu.mediaservice.model.{Cost, Pay, Free, Image, ImageUsageRights}
import com.gu.mediaservice.api.Transformers


object ImageResponse {
  import com.gu.mediaservice.lib.formatting._
  implicit val dateTimeFormat = DateFormat

  val commonTransformers = new Transformers(Config.services)

  type FileMetadataEntity = EmbeddedEntity[FileMetadata]

  def fileMetaDataUri(id: String) = URI.create(s"${Config.rootUri}/images/$id/fileMetadata")

  def create(id: String, esSource: JsValue, withWritePermission: Boolean, included: List[String] = List()): (JsValue, List[Link]) = {

    val image = esSource.as[Image]
    val source = Json.toJson(image)(
      imageResponseWrites(image.id, included.contains("fileMetadata"))
    )

    // Round expiration time to try and hit the cache as much as possible
    // TODO: do we really need these expiration tokens? they kill our ability to cache...
    val expiration = roundDateTime(DateTime.now, Duration.standardMinutes(10)).plusMinutes(20)
    val fileUri = new URI((source \ "source" \ "file").as[String])
    val secureUrl = S3Client.signUrl(Config.imageBucket, fileUri, expiration)
    val secureThumbUrl = S3Client.signUrl(Config.thumbBucket, fileUri, expiration)

    val valid = ImageExtras.isValid(source \ "metadata")

    val data = source.transform(addSecureSourceUrl(secureUrl))
      .flatMap(_.transform(wrapUserMetadata(id)))
      .flatMap(_.transform(addSecureThumbUrl(secureThumbUrl)))
      .flatMap(_.transform(addValidity(valid)))
      .flatMap(_.transform(addUsageCost(source))).get

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

  def addUsageCost(source: JsValue): Reads[JsObject] = {

    val cost = ImageExtras.getCost(
      (source \ "metadata" \ "credit").as[Option[String]],
      (source \ "metadata" \ "source").as[Option[String]],
      (source \ "usageRights" \ "supplier").asOpt[String],
      (source \ "usageRights" \ "suppliersCollection").asOpt[String],
      (source \ "userMetadata" \ "usageRights").asOpt[UsageRights]
    )

    __.json.update(__.read[JsObject].map(_ ++ Json.obj("cost" -> cost.toString)))
  }

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

  def imageResponseWrites(id: String, expandFileMetaData: Boolean): Writes[Image] = (
    (__ \ "id").write[String] ~
    (__ \ "uploadTime").write[DateTime] ~
    (__ \ "uploadedBy").write[String] ~
    (__ \ "lastModified").writeNullable[DateTime] ~
    (__ \ "identifiers").write[Map[String,String]] ~
    (__ \ "source").write[Asset] ~
    (__ \ "thumbnail").writeNullable[Asset] ~
    (__ \ "fileMetadata").write[FileMetadataEntity]
      .contramap(fileMetadataEntity(id, expandFileMetaData, _: FileMetadata)) ~
    (__ \ "userMetadata").writeNullable[Edits] ~
    (__ \ "metadata").write[ImageMetadata] ~
    (__ \ "originalMetadata").write[ImageMetadata] ~
    (__ \ "usageRights").write[ImageUsageRights] ~
    (__ \ "originalUsageRights").write[ImageUsageRights] ~
    (__ \ "exports").write[List[Export]]
      .contramap((crops: List[Crop]) => crops.map(Export.fromCrop(_:Crop)))

  )(unlift(Image.unapply))

  def fileMetadataEntity(id: String, expandFileMetaData: Boolean, fileMetadata: FileMetadata) = {
    val displayableMetadata = if(expandFileMetaData) Some(fileMetadata) else None

    EmbeddedEntity[FileMetadata](fileMetaDataUri(id), displayableMetadata)
  }
}

