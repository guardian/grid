package com.gu.mediaservice.picdarexport.lib

import java.net.URI

import scala.concurrent.Future

import org.joda.time.DateTime

import com.gu.mediaservice.picdarexport.lib.picdar.{PicdarError, PicdarClient}
import com.gu.mediaservice.picdarexport.lib.cleanup.{UsageRightsOverride, MetadataOverrides}
import com.gu.mediaservice.picdarexport.lib.usage.PrintUsageRequestFactory
import com.gu.mediaservice.picdarexport.model._
import com.gu.mediaservice.picdarexport.lib.media._
import com.gu.mediaservice.picdarexport.lib.db._

import com.gu.mediaservice.model.{UsageRights, ImageMetadata}

import play.api.libs.concurrent.Execution.Implicits._


trait ArgumentHelpers {

  val QueryRangeExpr = """(?:(\d+)-)?(\d+)""".r

  val defaultRangeLength = 10

  def optInt(strOrNull: String): Option[Int] = Option(strOrNull).map(_.toInt)

  def parseQueryRange(rangeSpec: String) = rangeSpec match {
    case QueryRangeExpr(start, length) => optInt(length).map(len => Range(optInt(start) getOrElse 0, len))
    case _ => throw new ArgumentError(s"Invalid range: $rangeSpec")
  }

  // FIXME: broken for --2014-11-12
  val DateRangeExpr = """(?:(\d{4}-\d{2}-\d{2})?--)?(\d{4}-\d{2}-\d{2})?""".r
  def optDate(strOrNull: String): Option[DateTime] = Option(strOrNull).map(DateTime.parse)

  def parseDateRange(rangeSpec: String) = rangeSpec match {
    case "any"                           => DateRange.all
    case "today"                         => DateRange(Some(new DateTime), Some(new DateTime))
    case DateRangeExpr(fromDate, toDate) => {
      val Seq(fromDateOpt, toDateOpt) = Seq(fromDate, toDate) map optDate
      DateRange(fromDateOpt orElse toDateOpt, toDateOpt)
    }
    case _ => throw new ArgumentError(s"Invalid range: $rangeSpec")
  }

}

trait ExecutionHelpers {
  // TODO: find a cleaner way to do this? play.api.Play.stop() doesn't seem to work...
  def terminateAfter[T](process: => Future[T]) = {
    val execution = process
    execution onFailure  { case e: Throwable => e.printStackTrace; System.exit(1) }
    execution onComplete { _ => System.exit(0) }
  }

}

class ArgumentError(message: String) extends Error(message)

class ExportManager(picdar: PicdarClient, loader: MediaLoader, mediaApi: MediaApi, usageApi: UsageApi) {

  def ingest(assetUri: URI, picdarUrn: String, uploadTime: DateTime): Future[URI] =
    for {
      data   <- picdar.getAssetData(assetUri)
      uri    <- loader.upload(data, picdarUrn, uploadTime)
    } yield uri

  def sendUsage(mediaUri: URI, usage: List[PicdarUsageRecord]): Future[Unit] = {
    for {
      imageResource <- mediaApi.getImageResource(mediaUri)
      printUsageRequest = PrintUsageRequestFactory.create(usage, imageResource.data.id)
      _ <- usageApi.postPrintUsage(printUsageRequest)
    } yield Unit
  }

  def getImageResource(mediaUri: URI) =
    for { imageResource <- mediaApi.getImageResource(mediaUri) } yield imageResource.data

  def overrideMetadata(mediaUri: URI, picdarMetadata: ImageMetadata): Future[Boolean] = {


    for {
      image              <- mediaApi.getImage(mediaUri)
      currentMetadata     = image.metadata
      userMetadata        = image.userMetadata

      userMetadataUpdated = !(userMetadata == ImageMetadata.empty)

      // Check if userMetadata has been updated in grid, and provide no overrides
      picdarOverridesOpt  =
        if(userMetadataUpdated) {
          None
        } else {
          MetadataOverrides.getOverrides(currentMetadata, picdarMetadata)
        }

      overridden         <- applyMetadataOverridesIfAny(image, picdarOverridesOpt)
    } yield overridden

  }


  private def applyMetadataOverrides(image: Image, overrides: ImageMetadata): Future[Unit] = {
    mediaApi.overrideMetadata(image.metadataOverrideUri, overrides)
  }

  private def applyMetadataOverridesIfAny(
    image: Image,
    overrides: Option[ImageMetadata]
  ): Future[Boolean] = overrides match {
    case Some(actualOverrides) => applyMetadataOverrides(image, actualOverrides).map(_ => true)
    case None => Future.successful(false)
  }


  private def ingestAsset(asset: Asset) =
    ingest(asset.file, asset.urn, asset.created)

  def overrideRights(mediaUri: URI, picdarRights: UsageRights): Future[Boolean] = {
    for {
      image         <- mediaApi.getImage(mediaUri)
      currentRights  = image.usageRights
      overridesOpt   = UsageRightsOverride.getOverrides(currentRights, picdarRights)
      overridden    <- applyRightsOverridesIfAny(image, overridesOpt)
    } yield overridden
  }

  private def applyRightsOverrides(image: Image, overrides: UsageRights): Future[Unit] = {
    mediaApi.overrideUsageRights(image.usageRightsOverrideUri, overrides)
  }

  def applyRightsOverridesIfAny(image: Image, rightsOpt: Option[UsageRights]): Future[Boolean] = rightsOpt match {
    case Some(rights) => applyRightsOverrides(image, rights).map(_ => true)
    case None => Future.successful(false)
  }
}


trait ExportManagerProvider {

  lazy val picdarDesk = new PicdarClient {
    override val picdarUrl      = Config.picdarDeskUrl
    override val picdarUsername = Config.picdarDeskUsername
    override val picdarPassword = Config.picdarDeskPassword
  }

  lazy val picdarLib = new PicdarClient {
    override val picdarUrl      = Config.picdarLibraryUrl
    override val picdarUsername = Config.picdarLibraryUsername
    override val picdarPassword = Config.picdarLibraryPassword
  }

  def loaderInstance(config: MediaConfig) = new MediaLoader {
    override val loaderApiKey      = config.apiKey
    override val loaderEndpointUrl = config.loaderUrl
  }

  def mediaApiInstance(config: MediaConfig) = new MediaApi {
    override val mediaApiKey = config.apiKey
  }

  def usageApiInstance(config: MediaConfig) = new UsageApi {
    override val mediaApiKey = config.apiKey
    override val postPrintUsageEndpointUrl = config.usageUrl
  }

  def getPicdar(system: String) = system match {
    case "desk"    => picdarDesk
    case "library" => picdarLib
    case other     => throw new ArgumentError(s"Invalid picdar system name: $other")
  }

  def getLoader(env: String) = loaderInstance(Config.mediaConfig(env))
  def getMediaApi(env: String) = mediaApiInstance(Config.mediaConfig(env))
  def getUsageApi(env: String) = usageApiInstance(Config.mediaConfig(env))

  def getExportManager(picdarSystem: String, mediaEnv: String) =
    new ExportManager(
      getPicdar(picdarSystem),
      getLoader(mediaEnv),
      getMediaApi(mediaEnv),
      getUsageApi(mediaEnv)
    )

  def getDynamo(env: String) = {
    new ExportDynamoDB(Config.awsCredentials(env), Config.dynamoRegion, Config.picdarExportTable(env))
  }
}


