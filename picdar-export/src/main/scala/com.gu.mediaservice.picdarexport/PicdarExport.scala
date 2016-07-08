package com.gu.mediaservice.picdarexport

import java.net.URI

import play.api.libs.json._

import com.gu.mediaservice.model.{UsageRights, ImageMetadata}
import com.gu.mediaservice.picdarexport.lib.cleanup.{UsageRightsOverride, MetadataOverrides}
import com.gu.mediaservice.picdarexport.lib.db._
import com.gu.mediaservice.picdarexport.lib.media._
import com.gu.mediaservice.picdarexport.lib.audit._
import com.gu.mediaservice.picdarexport.lib.picdar.{PicdarError, PicdarClient}
import com.gu.mediaservice.picdarexport.lib.{Config, MediaConfig}
import com.gu.mediaservice.picdarexport.lib.{ArgumentHelpers, ExecutionHelpers, ExportManager, ExportManagerProvider, ArgumentError}
import com.gu.mediaservice.picdarexport.model._
import play.api.Logger
import play.api.libs.concurrent.Execution.Implicits._

import com.gu.mediaservice.picdarexport.lib.usage.PrintUsageRequestFactory
import com.gu.mediaservice.model.PrintUsageRequest

import scala.util.Try
import scala.concurrent.Future
import scala.language.postfixOps
import org.joda.time.DateTime


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
    dynamo.getUnfetched(dateRange) flatMap { urns =>
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

  import scala.concurrent.Await
  import akka.util.Timeout
  import scala.concurrent.duration._

  def ingest(env: String, dateRange: DateRange = DateRange.all, range: Option[Range] = None) = {
    val ingestWait = Timeout(60 seconds)

    val dynamo = getDynamo(env)
    dynamo.getNotIngested(dateRange) flatMap { assets =>
      Future { takeRange(assets, range).par.map { asset =>
        // .get on options here will induce intentional failure if not available
        try {
          val mediaUri = Await.result(
            getExportManager("library", env).ingest(
              asset.picdarAssetUrl.get,
              asset.picdarUrn,
              asset.picdarCreatedFull.get
            ), ingestWait.duration)

          Logger.info(s"Ingested ${asset.picdarUrn} to $mediaUri")
          dynamo.recordIngested(asset.picdarUrn, asset.picdarCreated, mediaUri)
        } catch { case e: Throwable =>
          Logger.warn(s"Upload error for ${asset.picdarUrn}: $e")
          e.printStackTrace()
        }
      }
    }}
  }

  def doOverride(env: String, dateRange: DateRange = DateRange.all, range: Option[Range] = None) = {
    val dynamo = getDynamo(env)
    dynamo.scanIngestedNotOverridden(dateRange) flatMap { assets =>
      val updates = takeRange(assets, range).map { asset =>

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
      val updates = takeRange(urns, range).map { assetRow  =>
        getPicdar(system).get(assetRow.picdarUrn) flatMap { asset =>
          Logger.info(s"Fetching usage rights for image ${asset.urn}")
          dynamo.recordRights(assetRow.picdarUrn, assetRow.picdarCreated, asset.usageRights)
        } recover { case PicdarError(message) =>
          Logger.warn(s"Picdar error during fetch: $message")
        }
      }
      Future.sequence(updates)
    }
  }

  import java.io._

  def checkMissing(
    env: String,
    dateRange: DateRange = DateRange.all,
    range: Option[Range] = None
  ) = {
    val getMissingImageReport = CheckMissing.runReport(env, dateRange)
    val getReingestReport = CheckMissing.reingestFromReport(env, getMissingImageReport)

    def writeFile(filename:String, json: JsValue): Try[Unit] = {
      Try {
        val bw = new BufferedWriter(new FileWriter(filename))
        bw.write(json.toString)
        bw.close()
      }
    }

    for {
      missingImageReport <- getMissingImageReport
      reingestReport     <- getReingestReport

      missingImageReportJson = Json.toJson(missingImageReport)
      reingestReportJson     = Json.toJson(reingestReport)

      writeImageReport    = writeFile(s"missing_image_report-${dateRange}.json", missingImageReportJson)
      writeReingestReport = writeFile(s"reingest_report-${dateRange}.json", reingestReportJson)

    } yield Future {
      writeImageReport.get
      writeReingestReport.get
    }
  }

  import com.gu.mediaservice.picdarexport.lib.picdar.UsageApi

  def fetchUsage(
    env: String,
    dateRange: DateRange = DateRange.all,
    range: Option[Range] = None
  ) = {
    val dynamo = getDynamo(env)

    dynamo.getNoUsage(dateRange) flatMap { urns =>
      val updates = takeRange(urns, range).map { assetRef =>
        UsageApi.get(assetRef.urn).flatMap { usages =>
          dynamo.recordUsage(assetRef.urn, assetRef.dateLoaded, usages)
        }
      }
      Future.sequence(updates)
    }
  }

  def sendUsage(
    env: String,
    dateRange: DateRange = DateRange.all,
    range: Option[Range] = None
  ) = {
    val dynamo = getDynamo(env)

    dynamo.getUsageNotRecorded(dateRange) flatMap { urns =>
      val updates = takeRange(urns, range).map { asset =>
        val mediaUri = asset.mediaUri.get
        val usage = asset.picdarUsage.get

        getExportManager("desk", env).sendUsage(mediaUri, usage).flatMap { _ =>
          Logger.info(s"Usage sent successfully for ${asset.picdarUrn}")
          dynamo.recordUsageSent(asset.picdarUrn, asset.picdarCreated)
        } recover { case e: Throwable =>
            Logger.warn(s"Usage send error for ${asset.picdarUrn}: $e")
            e.printStackTrace()
        }
      }
      Future.sequence(updates)
    }
  }

  def overrideRights(env: String, dateRange: DateRange = DateRange.all, range: Option[Range] = None) = {
    val dynamo = getDynamo(env)
    dynamo.scanRightsFetchedNotOverridden(dateRange) flatMap { assets =>
      val updates = takeRange(assets, range).flatMap { asset =>

        asset.mediaUri.map { mediaUri =>
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

    case "+usage:fetch" :: env :: Nil => terminateAfter {
      fetchUsage(env)
    }
    case "+usage:fetch" :: env :: date :: Nil => terminateAfter {
      fetchUsage(env, parseDateRange(date))
    }
    case "+usage:fetch" :: env :: date :: rangeStr :: Nil => terminateAfter {
      fetchUsage(env, parseDateRange(date), parseQueryRange(rangeStr))
    }

    case "+usage:send" :: env :: Nil => terminateAfter {
      sendUsage(env)
    }
    case "+usage:send" :: env :: date :: Nil => terminateAfter {
      sendUsage(env, parseDateRange(date))
    }
    case "+usage:send" :: env :: date :: rangeStr :: Nil => terminateAfter {
      sendUsage(env, parseDateRange(date), parseQueryRange(rangeStr))
    }

    case "+check" :: env :: Nil => terminateAfter {
      checkMissing(env)
    }
    case "+check" :: env :: date :: Nil => terminateAfter {
      checkMissing(env, parseDateRange(date))
    }
    case "+check" :: env :: date :: rangeStr :: Nil => terminateAfter {
      checkMissing(env, parseDateRange(date), parseQueryRange(rangeStr))
    }


    case _ => println(
      """
        |usage: :count-loaded    <dev|test|prod> [dateLoaded]
        |       :count-fetched   <dev|test|prod> [dateLoaded]
        |       :count-ingested  <dev|test|prod> [dateLoaded]
        |       :count-overriden <dev|test|prod> [dateLoaded]
        |
        |       :show     <desk|library>  <picdarUrl>
        |       :query    <desk|library>  <created|modified|taken> <date> [query]
        |       +load     <dev|test|prod> <desk|library> <created|modified|taken> <date> [range] [query]
        |       +fetch    <dev|test|prod> <desk|library> [dateLoaded] [range]
        |       +ingest   <dev|test|prod> [dateLoaded] [range]
        |       +override <dev|test|prod> [dateLoaded] [range]
        |       +clear    <dev|test|prod> [dateLoaded]
        |       :stats    <dev|test|prod> [dateLoaded]
        |
        |       +rights:fetch    <dev|test|prod> <desk|library> [dateLoaded] [range]
        |       +rights:override <dev|test|prod> [dateLoaded] [range]
        |
        |       +usage:fetch     <dev|test|prod> [dateLoaded] [range]
        |       +usage:send      <dev|test|prod> [dateLoaded] [range]
        |
        |       +check           <dev|test|prod> [dateLoaded] [range]
      """.stripMargin
    )
  }
}
