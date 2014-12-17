package com.gu.mediaservice.picdarexport

import java.net.URI

import com.gu.mediaservice.picdarexport.lib.media.MediaLoader
import com.gu.mediaservice.picdarexport.lib.picdar.PicdarClient
import com.gu.mediaservice.picdarexport.lib.{Config, MediaConfig}
import com.gu.mediaservice.picdarexport.model._
import play.api.libs.json.Json

import scala.concurrent.Future
import scala.concurrent.ExecutionContext.Implicits.global
import scala.language.postfixOps
import org.joda.time.DateTime
import org.joda.time.format.ISODateTimeFormat

class ArgumentError(message: String) extends Error(message)


class ExportManager(picdar: PicdarClient, loader: MediaLoader) {
  def show(picdarUrn: String) =
    for {
      asset <- picdar.get(picdarUrn)
      _      = println(asset)
    } yield asset

  def query(dateField: String, dateRange: DateRange) =
    for {
      count <- picdar.count(dateField, dateRange)
      _      = println(s"$count matches")
    } yield count

  def ingest(dateField: String, dateRange: DateRange, queryRange: Option[Range]) = {
    for {
      assets       <- picdar.query(dateField, dateRange, queryRange)
      _             = println(s"${assets.size} matches")
      uploadedIds  <- Future.sequence(assets map uploadAsset)
      _             = println(s"Uploaded $uploadedIds")
    } yield uploadedIds

  }


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

object ExportApp extends App with ExportManagerProvider with ArgumentHelpers {

  val app = new play.core.StaticApplication(new java.io.File("."))

  args.toList match {
    case "show" :: system :: urn :: Nil => {
      // dummy media env as not used
      getExportManager(system, "dev").show(urn)
    }
    case "query" :: system :: dateField :: date :: Nil => {
      // dummy media env as not used
      getExportManager(system, "dev").query(dateField, parseDateRange(date))
    }
    case "ingest" :: system :: env :: dateField :: date :: Nil => {
      getExportManager(system, env).ingest(dateField, parseDateRange(date), None)
    }
    case "ingest" :: system :: env :: dateField :: date :: range :: Nil => {
      getExportManager(system, env).ingest(dateField, parseDateRange(date), parseQueryRange(range))
    }
    case _ => println(
      """
        |usage: show   <desk|library> <picdarUrl>
        |       query  <desk|library> <created|modified|taken> <date>
        |       ingest <desk|library> <dev|test> <created|modified|taken> <date> [range]
      """.stripMargin
    )
  }

  // FIXME: how can we shutdown the app?

}
