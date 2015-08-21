package com.gu.mediaservice.picdarexport

import java.net.URI

import com.gu.mediaservice.model.{UsageRights, ImageMetadata}
import com.gu.mediaservice.picdarexport.lib.cleanup.{UsageRightsOverride, MetadataOverrides}
import com.gu.mediaservice.picdarexport.lib.db.ExportDynamoDB
import com.gu.mediaservice.picdarexport.lib.media._
import com.gu.mediaservice.picdarexport.lib.picdar.{PicdarError, PicdarClient}
import com.gu.mediaservice.picdarexport.lib.{Config, MediaConfig}
import com.gu.mediaservice.picdarexport.model._
import play.api.Logger
import play.api.libs.concurrent.Execution.Implicits._

import scala.concurrent.Future
import scala.language.postfixOps
import org.joda.time.DateTime

class ArgumentError(message: String) extends Error(message)


class ExportManager(picdar: PicdarClient, loader: MediaLoader, mediaApi: MediaApi) {

  def ingest(assetUri: URI, picdarUrn: String, uploadTime: DateTime): Future[URI] =
    for {
      data   <- picdar.getAssetData(assetUri)
      uri    <- loader.upload(data, picdarUrn, uploadTime)
    } yield uri

  def overrideMetadata(mediaUri: URI, picdarMetadata: ImageMetadata): Future[Boolean] =
    for {
      image              <- mediaApi.getImage(mediaUri)
      currentMetadata     = image.metadata
      picdarOverridesOpt  = MetadataOverrides.getOverrides(currentMetadata, picdarMetadata)
      overridden         <- applyMetadataOverridesIfAny(image, picdarOverridesOpt)
    } yield overridden


  private def applyMetadataOverrides(image: Image, overrides: ImageMetadata): Future[Unit] = {
    mediaApi.overrideMetadata(image.metadataOverrideUri, overrides)
  }

  private def applyMetadataOverridesIfAny(image: Image, overrides: Option[ImageMetadata]): Future[Boolean] = overrides match {
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

  def getPicdar(system: String) = system match {
    case "desk"    => picdarDesk
    case "library" => picdarLib
    case other     => throw new ArgumentError(s"Invalid picdar system name: $other")
  }

  def getLoader(env: String) = loaderInstance(Config.mediaConfig(env))
  def getMediaApi(env: String) = mediaApiInstance(Config.mediaConfig(env))

  def getExportManager(picdarSystem: String, mediaEnv: String) =
    new ExportManager(getPicdar(picdarSystem), getLoader(mediaEnv), getMediaApi(mediaEnv))

  def getDynamo(env: String) = {
    new ExportDynamoDB(Config.awsCredentials(env), Config.dynamoRegion, Config.picdarExportTable(env))
  }

}

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

object ExportApp extends App with ExportManagerProvider with ArgumentHelpers with ExecutionHelpers {

  def dumpMetadata(metadata: Map[String,String]): String = {
    metadata.map { case (key, value) => s"  $key: $value" }.mkString("\n")
  }

  def takeRange[T](items: Seq[T], rangeOpt: Option[Range]): Seq[T] = rangeOpt match {
    case Some(range) => items.drop(range.start).take(range.length)
    case None        => items
  }


  def show(system: String, urn: String) = {
    getPicdar(system).get(urn) map { asset =>
      println(
        s"""
           |urn: ${asset.urn}
            |file: ${asset.file}
            |created: ${asset.created}
            |modified: ${asset.modified getOrElse ""}
            |infoUri: ${asset.infoUri getOrElse ""}
            |metadata:
            |${asset.metadata}
            |rights:
            |${asset.usageRights}
        """.stripMargin
      )
    }
  }

  def query(system: String, dateField: String, dateRange: DateRange = DateRange.all, query: Option[String] = None) = {
    getPicdar(system).count(dateField, dateRange, query) map { count =>
      println(s"$count matches")
    }
  }

  def stats(env: String, dateRange: DateRange = DateRange.all): Future[Unit] = {
    val dynamo = getDynamo(env)
    for {
      loaded     <- dynamo.scanUnfetched(dateRange)
      _           = println(s"${loaded.size} loaded entries to fetch")
      fetched    <- dynamo.scanFetchedNotIngested(dateRange)
      _           = println(s"${fetched.size} fetched entries to ingest")
      ingested   <- dynamo.scanIngestedNotOverridden(dateRange)
      _           = println(s"${ingested.size} ingested entries to override")
      overridden <- dynamo.scanOverridden(dateRange)
      _           = println(s"${overridden.size} overridden entries")
    } yield ()

  }

  def load(env: String, system: String, dateField: String, dateRange: DateRange = DateRange.all,
           range: Option[Range] = None, query: Option[String] = None) = {
    val dynamo = getDynamo(env)
    getPicdar(system).query(dateField, dateRange, range, query) flatMap { assetRefs =>
      val saves = assetRefs.map { assetRef =>
        dynamo.insert(assetRef.urn, assetRef.dateLoaded)
      }
      Future.sequence(saves)
    }
  }

  def fetch(env: String, system: String, dateRange: DateRange = DateRange.all, range: Option[Range] = None) = {
    val dynamo = getDynamo(env)
    dynamo.scanUnfetched(dateRange) flatMap { urns =>
      val updates = takeRange(urns, range).map { assetRef =>
        getPicdar(system).get(assetRef.urn) flatMap { asset =>
          dynamo.record(assetRef.urn, assetRef.dateLoaded, asset.file, asset.created, asset.modified, asset.metadata)
        } recover { case PicdarError(message) =>
          Logger.warn(s"Picdar error during fetch: $message")
        }
      }
      Future.sequence(updates)
    }
  }

  def ingest(env: String, dateRange: DateRange = DateRange.all, range: Option[Range] = None) = {
    val dynamo = getDynamo(env)
    dynamo.scanFetchedNotIngested(dateRange) flatMap { assets =>
      val updates = takeRange(assets, range).map { asset =>
        getExportManager("library", env).ingest(asset.picdarAssetUrl, asset.picdarUrn, asset.picdarCreatedFull) flatMap { mediaUri =>
          Logger.info(s"Ingested ${asset.picdarUrn} to $mediaUri")
          dynamo.recordIngested(asset.picdarUrn, asset.picdarCreated, mediaUri)
        } recover { case e: Throwable =>
          Logger.warn(s"Upload error for ${asset.picdarUrn}: $e")
          e.printStackTrace()
        }
      }
      Future.sequence(updates)
    }
  }

  def doOverride(env: String, dateRange: DateRange = DateRange.all, range: Option[Range] = None) = {
    val dynamo = getDynamo(env)
    dynamo.scanIngestedNotOverridden(dateRange) flatMap { assets =>
      val updates = takeRange(assets, range).map { asset =>
        // TODO: if no mediaUri, skip
        // FIXME: HACKK!
        val mediaUri = asset.mediaUri.get
        val metadata = asset.picdarMetadata.get
        getExportManager("library", env).overrideMetadata(mediaUri, metadata) flatMap { overridden =>
          Logger.info(s"Overridden $mediaUri metadata ($overridden)")
          dynamo.recordOverridden(asset.picdarUrn, asset.picdarCreated, overridden)
        } recover { case e: Throwable =>
          Logger.warn(s"Metadata override error for ${asset.picdarUrn}: $e")
          e.printStackTrace()
        }
      }
      Future.sequence(updates)
    }
  }

  def clear(env: String, dateRange: DateRange = DateRange.all) = {
    val dynamo = getDynamo(env)
    dynamo.delete(dateRange) map { rows =>
      println(s"Cleared ${rows.size} entries")
    }
  }

  def fetchRights(env: String, system: String, dateRange: DateRange = DateRange.all, range: Option[Range] = None) = {
    val dynamo = getDynamo(env)
    dynamo.scanNoRights(dateRange) flatMap { urns =>
      val updates = takeRange(urns, range).map { assetRef =>
        getPicdar(system).get(assetRef.urn) flatMap { asset =>
          Logger.info(s"Fetching usage rights for image ${asset.urn} to: ${asset.usageRights.map(_.category).getOrElse("none")}")
          dynamo.recordRights(assetRef.urn, assetRef.dateLoaded, asset.usageRights)
        } recover { case PicdarError(message) =>
          Logger.warn(s"Picdar error during fetch: $message")
        }
      }
      Future.sequence(updates)
    }
  }

  def overrideRights(env: String, dateRange: DateRange = DateRange.all, range: Option[Range] = None) = {
    val dynamo = getDynamo(env)
    dynamo.scanRightsFetchedNotOverridden(dateRange) flatMap { assets =>
      val updates = takeRange(assets, range).map { asset =>
        // TODO: if no mediaUri, skip
        // FIXME: HACKK!
        val mediaUri = asset.mediaUri.get
        asset.picdarRights map { rights =>
          Logger.info(s"Overriding rights on $mediaUri to: $rights")
          getExportManager("library", env).overrideRights(mediaUri, rights) flatMap { overridden =>
            Logger.info(s"Overridden $mediaUri rights ($overridden)")
            dynamo.recordRightsOverridden(asset.picdarUrn, asset.picdarCreated, overridden)
          } recover { case e: Throwable =>
            Logger.warn(s"Rights override error for ${asset.picdarUrn}: $e")
            e.printStackTrace()
          }
        } getOrElse {
          Logger.info(s"No rights overrides for $mediaUri (not fetched?), skipping")
          Future.successful(())
        }
      }
      Future.sequence(updates)
    }
  }


  args.toList match {
    case ":count-loaded" :: env :: Nil => terminateAfter {
      val dynamo = getDynamo(env)
      dynamo.scanUnfetched(DateRange.all) map (urns => urns.size) map { count =>
        println(s"$count matching entries")
        count
      }
    }
    case ":count-loaded" :: env :: date :: Nil => terminateAfter {
      val dynamo = getDynamo(env)
      val dateRange = parseDateRange(date)
      for {
        loaded     <- dynamo.scanUnfetched(dateRange)
        _           = println(s"${loaded.size} loaded entries to fetch")
        fetched    <- dynamo.scanFetchedNotIngested(dateRange)
        _           = println(s"${fetched.size} fetched entries to ingest")
        ingested   <- dynamo.scanIngestedNotOverridden(dateRange)
        _           = println(s"${ingested.size} ingested entries to override")
        overridden <- dynamo.scanOverridden(dateRange)
        _           = println(s"${overridden.size} overridden entries")
      } yield ()
    }

    case ":count-fetched" :: env :: Nil => terminateAfter {
      val dynamo = getDynamo(env)
      dynamo.scanFetchedNotIngested(DateRange.all) map (urns => urns.size) map { count =>
        println(s"$count matching entries")
        count
      }
    }
    case ":count-fetched" :: env :: date :: Nil => terminateAfter {
      val dynamo = getDynamo(env)
      dynamo.scanFetchedNotIngested(parseDateRange(date)) map (urns => urns.size) map { count =>
        println(s"$count matching entries")
        count
      }
    }

    case ":count-ingested" :: env :: Nil => terminateAfter {
      val dynamo = getDynamo(env)
      dynamo.scanIngestedNotOverridden(DateRange.all) map (urns => urns.size) map { count =>
        println(s"$count matching entries")
        count
      }
    }
    case ":count-ingested" :: env :: date :: Nil => terminateAfter {
      val dynamo = getDynamo(env)
      dynamo.scanIngestedNotOverridden(parseDateRange(date)) map (urns => urns.size) map { count =>
        println(s"$count matching entries")
        count
      }
    }

    case ":count-overridden" :: env :: Nil => terminateAfter {
      val dynamo = getDynamo(env)
      dynamo.scanOverridden(DateRange.all) map (urns => urns.size) map { count =>
        println(s"$count matching entries")
        count
      }
    }
    case ":count-overridden" :: env :: date :: Nil => terminateAfter {
      val dynamo = getDynamo(env)
      dynamo.scanOverridden(parseDateRange(date)) map (urns => urns.size) map { count =>
        println(s"$count matching entries")
        count
      }
    }


    case ":show" :: system :: urn :: Nil => terminateAfter {
      show(system, urn)
    }

    case ":query" :: system :: dateField :: date :: Nil => terminateAfter {
      query(system, dateField, parseDateRange(date))
    }
    case ":query" :: system :: dateField :: date :: queryStr :: Nil => terminateAfter {
      query(system, dateField, parseDateRange(date), Some(queryStr))
    }

    case ":stats" :: env :: Nil => terminateAfter {
      stats(env)
    }
    case ":stats" :: env :: date :: Nil => terminateAfter {
      stats(env, parseDateRange(date))
    }


    case "+load" :: env :: system :: dateField :: date :: Nil => terminateAfter {
      load(env, system, dateField, parseDateRange(date))
    }
    case "+load" :: env :: system :: dateField :: date :: rangeStr :: Nil => terminateAfter {
      load(env, system, dateField, parseDateRange(date), parseQueryRange(rangeStr))
    }
    case "+load" :: env :: system :: dateField :: date :: rangeStr :: query :: Nil => terminateAfter {
      load(env, system, dateField, parseDateRange(date), parseQueryRange(rangeStr), Some(query))
    }

    case "+fetch" :: env :: system :: Nil => terminateAfter {
      fetch(env, system)
    }
    case "+fetch" :: env :: system :: date :: Nil => terminateAfter {
      fetch(env, system, parseDateRange(date))
    }
    case "+fetch" :: env :: system :: date :: rangeStr :: Nil => terminateAfter {
      fetch(env, system, parseDateRange(date), parseQueryRange(rangeStr))
    }

    case "+ingest" :: env :: Nil => terminateAfter {
      ingest(env)
    }
    case "+ingest" :: env :: date :: Nil => terminateAfter {
      ingest(env, parseDateRange(date))
    }
    case "+ingest" :: env :: date :: rangeStr :: Nil => terminateAfter {
      ingest(env, parseDateRange(date), parseQueryRange(rangeStr))
    }


    case "+override" :: env :: Nil => terminateAfter {
      doOverride(env)
    }
    case "+override" :: env :: date :: Nil => terminateAfter {
      doOverride(env, parseDateRange(date))
    }
    case "+override" :: env :: date :: rangeStr :: Nil => terminateAfter {
      doOverride(env, parseDateRange(date), parseQueryRange(rangeStr))
    }


    case "+clear" :: env :: Nil => terminateAfter {
      clear(env)
    }
    case "+clear" :: env :: date :: Nil => terminateAfter {
      clear(env, parseDateRange(date))
    }

    case "+rights:fetch" :: env :: system :: Nil => terminateAfter {
      fetchRights(env, system)
    }
    case "+rights:fetch" :: env :: system :: date :: Nil => terminateAfter {
      fetchRights(env, system, parseDateRange(date))
    }
    case "+rights:fetch" :: env :: system :: date :: rangeStr :: Nil => terminateAfter {
      fetchRights(env, system, parseDateRange(date), parseQueryRange(rangeStr))
    }

    case "+rights:override" :: env :: Nil => terminateAfter {
      overrideRights(env)
    }
    case "+rights:override" :: env :: date :: Nil => terminateAfter {
      overrideRights(env, parseDateRange(date))
    }
    case "+rights:override" :: env :: date :: rangeStr :: Nil => terminateAfter {
      overrideRights(env, parseDateRange(date), parseQueryRange(rangeStr))
    }

    case _ => println(
      """
        |usage: :count-loaded    <dev|test|prod> [dateLoaded]
        |       :count-fetched   <dev|test|prod> [dateLoaded]
        |       :count-ingested  <dev|test|prod> [dateLoaded]
        |       :count-overriden <dev|test|prod> [dateLoaded]
        |
        |       :show   <desk|library> <picdarUrl>
        |       :query  <desk|library> <created|modified|taken> <date> [query]
        |       :stats  <dev|test|prod> [dateLoaded]
        |       +load   <dev|test|prod> <desk|library> <created|modified|taken> <date> [range] [query]
        |       +fetch  <dev|test|prod> <desk|library> [dateLoaded] [range]
        |       +ingest <dev|test|prod> [dateLoaded] [range]
        |       +override <dev|test|prod> [dateLoaded] [range]
        |       +clear  <dev|test|prod> [dateLoaded]
        |
        |       +rights:fetch    <dev|test|prod> <desk|library> [dateLoaded] [range]
        |       +rights:override <dev|test|prod> [dateLoaded] [range]
      """.stripMargin
    )
  }

}
