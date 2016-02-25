package com.gu.mediaservice.picdarexport.lib.audit

import java.net.URI

import scala.util.{Try, Success, Failure}
import scala.language.existentials
import scala.concurrent.Future

import play.api.libs.concurrent.Execution.Implicits._

import org.joda.time.DateTime

import com.gu.mediaservice.picdarexport.lib.{ArgumentHelpers, ExecutionHelpers, ExportManagerProvider}
import com.gu.mediaservice.picdarexport.lib.media.Image
import com.gu.mediaservice.picdarexport.model.DateRange


case class ImageIdent(
  urn: String,
  picdarCreated: DateTime,
  picdarUri: Option[URI],
  gridUri: Option[URI]
)
case class ImageRequest(ident: ImageIdent, request: Try[Image])
case class ImageMiss(ident: ImageIdent, reason: String)
case class ReingestAttempt(ident: ImageIdent, attempt: Try[URI])
case class MissingImageReport(
  dateRange: DateRange,
  misses: List[ImageMiss],
  exists: List[ImageIdent]
)

object CheckMissing extends ExportManagerProvider with ArgumentHelpers with ExecutionHelpers {

  private def futureToFutureTry[T](f: Future[T]): Future[Try[T]] =
    f.map(Success(_)).recover { case e => Failure(e) }

  def reingestFromReport(env: String, imageReport: Future[MissingImageReport]): Future[Unit] = {
    val dynamo = getDynamo(env)
    val export = getExportManager("library", env)
    val reingestImages = imageReport.flatMap(report => {
      println(s"Found ${report.misses.length} missing.")

      val reingestMissingList = report.misses.map(miss => {
        println(s"Reingesting: ${miss}")

        val reingest = export.ingest(
          miss.ident.picdarUri.get,
          miss.ident.urn,
          miss.ident.picdarCreated
        )

      (miss.ident, reingest)
      })

    val getReingestTries: List[Future[ReingestAttempt]] = reingestMissingList.map {
      case (ident, ingest) => futureToFutureTry(ingest)
        .map(tryReingest => ReingestAttempt(ident, tryReingest))
    }

    Future.sequence(getReingestTries)
    })

    val getGoodReingests = reingestImages.map(_.filter(_.attempt.isSuccess))
    val getBadReingests  = reingestImages.map(_.filter(_.attempt.isFailure))

    for {
      goodReingests <- getGoodReingests
      badReingests <- getBadReingests

      _ = goodReingests.map(goodReingest => println(s"OK reingest: ${goodReingest}"))
      _ = badReingests.map(badReingest => println(s"Failed reingest: ${badReingest}"))

    } yield println(s"Reingests done: ${badReingests.length} failed.")
  }

  def runReport(env: String, dateRange: DateRange): Future[MissingImageReport] = {
    val dynamo = getDynamo(env)
    val export = getExportManager("library", env)

    val getIdents = dynamo.getRowsForDateRange(dateRange).map((rows) => for {
      row <- rows
      urn =  row.picdarUrn
      picdarCreated = row.picdarCreated
      picdarUri = row.picdarAssetUrl
      gridUri =  row.mediaUri
    } yield ImageIdent(urn, picdarCreated, picdarUri, gridUri))

    val splitIdents = getIdents.map(_.groupBy {
      case ident if(ident.picdarUri.isEmpty) => "noPicdarAsset"
      case ident if(ident.gridUri.isEmpty) => "notIngested"
      case _ => "ok"
    })

    val getUris = splitIdents.map(_("ok"))

    val getImages = getUris.flatMap(idents => {
      val getImagesList: List[(ImageIdent, Future[Image])] =
        idents.map(ident => (ident, export.getImageResource(ident.gridUri.get)))
      val getImagesTries: List[Future[ImageRequest]] = getImagesList.map {
        case (ident, request) => futureToFutureTry(request).map(tryImage => ImageRequest(ident, tryImage))
      }

      Future.sequence(getImagesTries)
    })

    val getExists = getImages.map(_.filter(_.request.isSuccess))
    val getMisses = getImages.map(_.filter(_.request.isFailure))

    for {
      exists <- getExists
      misses <- getMisses

      otherMisses <- splitIdents

      existsIdents = exists.map(_.ident)
      missesIdents = misses.map(_.ident)

      grid404Misses  = missesIdents.map(ImageMiss(_,"mediaApi404"))
      noIngestMisses = otherMisses.getOrElse("notIngested", Nil).map(ImageMiss(_, "notIngested"))

      allMisses = grid404Misses ++ noIngestMisses
    } yield MissingImageReport(
      dateRange,
      allMisses,
      existsIdents
    )
  }

}
