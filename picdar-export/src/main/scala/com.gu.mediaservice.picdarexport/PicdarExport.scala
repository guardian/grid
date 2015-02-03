package com.gu.mediaservice.picdarexport

import java.net.URI

import com.gu.mediaservice.picdarexport.lib.db.ExportDynamoDB
import com.gu.mediaservice.picdarexport.lib.media.MediaLoader
import com.gu.mediaservice.picdarexport.lib.picdar.PicdarClient
import com.gu.mediaservice.picdarexport.lib.{Config, MediaConfig}
import com.gu.mediaservice.picdarexport.model._
import play.api.Logger
import play.api.libs.json.Json
import play.api.libs.concurrent.Execution.Implicits._

import scala.concurrent.Future
import scala.language.postfixOps
import org.joda.time.DateTime
import org.joda.time.format.ISODateTimeFormat

class ArgumentError(message: String) extends Error(message)


class ExportManager(picdar: PicdarClient, loader: MediaLoader) {

  def ingest(dateField: String, dateRange: DateRange, queryRange: Option[Range]) =
    for {
      assets       <- picdar.queryAssets(dateField, dateRange, queryRange)
      _             = Logger.info(s"${assets.size} matches")
      uploadedIds  <- Future.sequence(assets map uploadAsset)
    } yield uploadedIds


  private def uploadAsset(asset: Asset): Future[Option[URI]] =
    for {
      fileData <- picdar.readAssetFile(asset)
      params    = loaderParams(asset)
      mediaUri <- loader.upload(fileData, loaderParams(asset))
    } yield mediaUri


  private def loaderParams(asset: Asset): Map[String, String] = {
    val identifiers = Json.stringify(Json.obj("picdarUrn" -> asset.urn))
    val uploadTime = ISODateTimeFormat.dateTimeNoMillis().print(asset.created)
    Map("identifiers" -> identifiers, "uploadTime" -> uploadTime)
  }

}


trait ExportManagerProvider {

  val dynamo = new ExportDynamoDB(Config.awsCredentials, Config.dynamoRegion, Config.picdarExportTable)

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

  def getPicdar(system: String) = system match {
    case "desk"    => picdarDesk
    case "library" => picdarLib
    case other     => throw new ArgumentError(s"Invalid picdar system name: $other")
  }

  def getLoader(env: String) = loaderInstance(Config.mediaConfig(env))

  def getExportManager(picdarSystem: String, mediaEnv: String) =
    new ExportManager(getPicdar(picdarSystem), getLoader(mediaEnv))

}

trait ArgumentHelpers {

  val QueryRangeExpr = """(?:(\d+)-)?(\d+)""".r

  val defaultRangeLength = 10

  def optInt(strOrNull: String): Option[Int] = Option(strOrNull).map(_.toInt)

  def parseQueryRange(rangeSpec: String) = rangeSpec match {
    case QueryRangeExpr(start, length) => optInt(length).map(len => Range(optInt(start) getOrElse 0, len))
    case _ => throw new ArgumentError(s"Invalid range: $rangeSpec")
  }


  // TODO: for now we just allow a single day
  //  val DateRangeExpr = """(?:(\d{4}-\d{2}-\d{2})--)?(\d{4}-\d{2}-\d{2})?""".r
  val DateRangeExpr = """(\d{4}-\d{2}-\d{2})""".r

  def optDate(strOrNull: String): Option[DateTime] = Option(strOrNull).map(DateTime.parse)

  def parseDateRange(rangeSpec: String) = rangeSpec match {
    case "today"                      => DateRange(Some(new DateTime), Some(new DateTime))
    case DateRangeExpr(date)          => DateRange(optDate(date), optDate(date))
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
          |${dumpMetadata(asset.metadata)}
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
      getExportManager(system, env).ingest(dateField, parseDateRange(date), None)
    }
    case "ingest" :: system :: env :: dateField :: date :: range :: Nil => terminateAfter {
      getExportManager(system, env).ingest(dateField, parseDateRange(date), parseQueryRange(range)) map { uploadedIds =>
        println(s"Uploaded $uploadedIds")
        // TODO: show success/failures?
      }
    }

    case "+load" :: system :: dateField :: date :: Nil => terminateAfter {
      getPicdar(system).query(dateField, parseDateRange(date), None) flatMap { assetRefs =>
        val saves = assetRefs.map { assetRef =>
          dynamo.insert(assetRef.urn, assetRef.dateLoaded)
        }
        Future.sequence(saves)
      }
    }
    case "+load" :: system :: dateField :: date :: range :: Nil => terminateAfter {
      getPicdar(system).query(dateField, parseDateRange(date), parseQueryRange(range)) flatMap { assetRefs =>
        val saves = assetRefs.map { assetRef =>
          dynamo.insert(assetRef.urn, assetRef.dateLoaded)
        }
        Future.sequence(saves)
      }
    }

    case "+count" :: system :: Nil => terminateAfter {
      dynamo.scanUnfetched(DateRange.all) map (urns => urns.size) map { count =>
        println(s"$count matching entries")
        count
      }
    }
    case "+count" :: system :: date :: Nil => terminateAfter {
      dynamo.scanUnfetched(parseDateRange(date)) map (urns => urns.size) map { count =>
        println(s"$count matching entries")
        count
      }
    }

    case "+fetch" :: system :: Nil => terminateAfter {
      dynamo.scanUnfetched(DateRange.all) flatMap { urns =>
        val updates = urns.map { assetRef =>
          getPicdar(system).get(assetRef.urn) flatMap { asset =>
            dynamo.record(assetRef.urn, assetRef.dateLoaded, asset.file.toString, asset.created, asset.modified, asset.metadata)
          }
        }
        Future.sequence(updates)
      }
    }
    case "+fetch" :: system :: date :: Nil => terminateAfter {
      dynamo.scanUnfetched(parseDateRange(date)) flatMap { urns =>
        val updates = urns.map { assetRef =>
          getPicdar(system).get(assetRef.urn) flatMap { asset =>
            dynamo.record(assetRef.urn, assetRef.dateLoaded, asset.file.toString, asset.created, asset.modified, asset.metadata)
          }
        }
        Future.sequence(updates)
      }
    }
    case "+fetch" :: system :: date :: rangeStr :: Nil => terminateAfter {
      val range = parseQueryRange(rangeStr)
      dynamo.scanUnfetched(parseDateRange(date)) flatMap { urns =>
        // FIXME: meh code
        val rangeStart = range.map(_.start) getOrElse 0
        val rangeEnd = range.map(_.end) getOrElse urns.size
        val rangeLen = rangeEnd - rangeStart
        val updates = urns.drop(rangeStart).take(rangeLen).map { assetRef =>
          getPicdar(system).get(assetRef.urn) flatMap { asset =>
            dynamo.record(assetRef.urn, assetRef.dateLoaded, asset.file.toString, asset.created, asset.modified, asset.metadata)
          }
        }
        Future.sequence(updates)
      }
    }
    // TODO: all take date *range*
    // TODO: "+ingest" => upload to Grid

    case _ => println(
      """
        |usage: show   <desk|library> <picdarUrl>
        |       query  <desk|library> <created|modified|taken> <date>
        |       ingest <desk|library> <dev|test> <created|modified|taken> <date> [range]
        |       +load  <desk|library> <created|modified|taken> <date> [range]
        |       +count <desk|library> [dateLoaded]
        |       +fetch <desk|library> [dateLoaded] [range]
      """.stripMargin
    )
  }

}
