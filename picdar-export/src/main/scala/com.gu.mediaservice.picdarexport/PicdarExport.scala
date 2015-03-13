package com.gu.mediaservice.picdarexport

import java.net.URI

import com.gu.mediaservice.model.ImageMetadata
import com.gu.mediaservice.picdarexport.lib.cleanup.MetadataOverrides
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

  def queryAndIngest(dateField: String, dateRange: DateRange, queryRange: Option[Range]) =
    for {
      assets       <- picdar.queryAssets(dateField, dateRange, queryRange)
      _             = Logger.info(s"${assets.size} matches")
      uploadedIds  <- Future.sequence(assets map ingestAsset)
    } yield uploadedIds

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

  args.toList match {
    case "show" :: system :: urn :: Nil => terminateAfter {
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
        """.stripMargin
        )
      }
    }
    case "query" :: system :: dateField :: date :: Nil => terminateAfter {
      getPicdar(system).count(dateField, parseDateRange(date)) map { count =>
        println(s"$count matches")
      }
    }
    case "ingest" :: system :: env :: dateField :: date :: Nil => terminateAfter {
      getExportManager(system, env).queryAndIngest(dateField, parseDateRange(date), None)
    }
    case "ingest" :: system :: env :: dateField :: date :: range :: Nil => terminateAfter {
      getExportManager(system, env).queryAndIngest(dateField, parseDateRange(date), parseQueryRange(range)) map { uploadedIds =>
        println(s"Uploaded $uploadedIds")
        // TODO: show success/failures?
      }
    }

    case "+load" :: env :: system :: dateField :: date :: Nil => terminateAfter {
      val dynamo = getDynamo(env)
      getPicdar(system).query(dateField, parseDateRange(date), None) flatMap { assetRefs =>
        val saves = assetRefs.map { assetRef =>
          dynamo.insert(assetRef.urn, assetRef.dateLoaded)
        }
        Future.sequence(saves)
      }
    }
    case "+load" :: env :: system :: dateField :: date :: range :: Nil => terminateAfter {
      val dynamo = getDynamo(env)
      getPicdar(system).query(dateField, parseDateRange(date), parseQueryRange(range)) flatMap { assetRefs =>
        val saves = assetRefs.map { assetRef =>
          dynamo.insert(assetRef.urn, assetRef.dateLoaded)
        }
        Future.sequence(saves)
      }
    }

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
      dynamo.scanUnfetched(dateRange) map (urns => urns.size) map { count =>
        println(s"$count loaded entries")
      } andThen { case _ =>
        dynamo.scanFetchedNotIngested(dateRange) map (urns => urns.size) map { count =>
          println(s"$count fetched entries")
        }
      } andThen { case _ =>
        dynamo.scanOverridden(dateRange) map (urns => urns.size) map { count =>
          println(s"$count ingested entries")
        }
      }
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

    case "+fetch" :: env :: system :: Nil => terminateAfter {
      val dynamo = getDynamo(env)
      dynamo.scanUnfetched(DateRange.all) flatMap { urns =>
        val updates = urns.map { assetRef =>
          getPicdar(system).get(assetRef.urn) flatMap { asset =>
            dynamo.record(assetRef.urn, assetRef.dateLoaded, asset.file, asset.created, asset.modified, asset.metadata)
          } recover { case PicdarError(message) =>
            Logger.warn(s"Picdar error during fetch: $message")
          }
        }
        Future.sequence(updates)
      }
    }
    case "+fetch" :: env :: system :: date :: Nil => terminateAfter {
      val dynamo = getDynamo(env)
      dynamo.scanUnfetched(parseDateRange(date)) flatMap { urns =>
        val updates = urns.map { assetRef =>
          getPicdar(system).get(assetRef.urn) flatMap { asset =>
            dynamo.record(assetRef.urn, assetRef.dateLoaded, asset.file, asset.created, asset.modified, asset.metadata)
          } recover { case PicdarError(message) =>
            Logger.warn(s"Picdar error during fetch: $message")
          }
        }
        Future.sequence(updates)
      }
    }
    case "+fetch" :: env :: system :: date :: rangeStr :: Nil => terminateAfter {
      val dynamo = getDynamo(env)
      val range = parseQueryRange(rangeStr)
      dynamo.scanUnfetched(parseDateRange(date)) flatMap { urns =>
        // FIXME: meh code
        val rangeStart = range.map(_.start) getOrElse 0
        val rangeEnd = range.map(_.end) getOrElse urns.size
        val rangeLen = rangeEnd - rangeStart
        val updates = urns.drop(rangeStart).take(rangeLen).map { assetRef =>
          getPicdar(system).get(assetRef.urn) flatMap { asset =>
            dynamo.record(assetRef.urn, assetRef.dateLoaded, asset.file, asset.created, asset.modified, asset.metadata)
          } recover { case PicdarError(message) =>
            Logger.warn(s"Picdar error during fetch: $message")
          }
        }
        Future.sequence(updates)
      }
    }

    // TODO: allow no date range
    // TODO: allow no range
    case "+ingest" :: env :: date :: rangeStr :: Nil => terminateAfter {
      val dynamo = getDynamo(env)
      val range = parseQueryRange(rangeStr)
      dynamo.scanFetchedNotIngested(parseDateRange(date)) flatMap { assets =>
        // FIXME: meh code
        val rangeStart = range.map(_.start) getOrElse 0
        val rangeEnd = range.map(_.end) getOrElse assets.size
        val rangeLen = rangeEnd - rangeStart

        val updates = assets.drop(rangeStart).take(rangeLen).map { asset =>
          getExportManager("library", env).ingest(asset.picdarAssetUrl, asset.picdarUrn, asset.picdarCreated) flatMap { mediaUri =>
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


    // TODO: allow no date range
    // TODO: allow no range
    case "+override" :: env :: date :: rangeStr :: Nil => terminateAfter {
      val dynamo = getDynamo(env)
      val range = parseQueryRange(rangeStr)
      dynamo.scanIngestedNotOverridden(parseDateRange(date)) flatMap { assets =>
        // FIXME: meh code
        val rangeStart = range.map(_.start) getOrElse 0
        val rangeEnd = range.map(_.end) getOrElse assets.size
        val rangeLen = rangeEnd - rangeStart

        val updates = assets.drop(rangeStart).take(rangeLen).map { asset =>
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


    case "+clear" :: env :: Nil => terminateAfter {
      val dynamo = getDynamo(env)
      dynamo.delete(DateRange.all) map { rows =>
        println(s"Cleared ${rows.size} entries")
      }
    }

    case "+clear" :: env :: date :: Nil => terminateAfter {
      val dynamo = getDynamo(env)
      dynamo.delete(parseDateRange(date)) map { rows =>
        println(s"Cleared ${rows.size} entries")
      }
    }

    case _ => println(
      """
        |usage: show   <desk|library> <picdarUrl>
        |       query  <desk|library> <created|modified|taken> <date>
        |       ingest <desk|library> <dev|test> <created|modified|taken> <date> [range]
        |
        |       :stats  <dev|test> [dateLoaded]
        |       :count-loaded    <dev|test> [dateLoaded]
        |       :count-fetched   <dev|test> [dateLoaded]
        |       :count-ingested  <dev|test> [dateLoaded]
        |       :count-overriden <dev|test> [dateLoaded]
        |       +load   <dev|test> <desk|library> <created|modified|taken> <date> [range]
        |       +fetch  <dev|test> <desk|library> [dateLoaded] [range]
        |       +ingest <dev|test> [dateLoaded] [range]
        |       +override <dev|test> [dateLoaded] [range]
        |       +clear  <dev|test> [dateLoaded]
      """.stripMargin
    )
  }

}
