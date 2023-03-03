package com.gu.mediaservice.lib.imaging

import com.gu.mediaservice.lib.Files.createTempFile
import com.gu.mediaservice.lib.imaging.vips.Vips
import com.gu.mediaservice.lib.logging.{GridLogging, LogMarker}
import com.gu.mediaservice.model.{Bounds, Dimensions, MimeType}

import java.io.File
import scala.concurrent.{ExecutionContext, Future}
import scala.util.Try

class VipsImageOperations(val playPath: String)(implicit val ec: ExecutionContext)
  extends GridLogging with ImageOperations
{
  override def cropImage(
    sourceFile: File,
    sourceMimeType: Option[MimeType],
    bounds: Bounds,
    qual: Double,
    tempDir: File,
    iccColourSpace: Option[String],
    colourModel: Option[String],
    fileType: MimeType,
    isTransformedFromSource: Boolean
  )(implicit logMarker: LogMarker): Future[File] = {
    logger.info(s"Cropping to $bounds with libvips", logMarker)
    for {
      outputFile <- createTempFile(s"crop-", s"${fileType.fileExtension}", tempDir)
      _ <- futureFromTry { Vips.extractArea(sourceFile, outputFile, bounds, qual) }
    } yield outputFile
  }

  // convert f: () => Try[T] to () => Future[T]
  // Future.fromTry is _not equivalent_! That will run the function synchronously, then transform into a Future.
  // This will start a future, then run the function asynchronously, and then convert the Try into a Future
  private def futureFromTry[T](f: => Try[T]): Future[T] =
//    Future.unit.transform{ _ => f }
    Future { Future.fromTry(f) }.flatten

  override def resizeImage(
    sourceFile: File,
    sourceMimeType: Option[MimeType],
    dimensions: Dimensions,
    scale: Double,
    qual: Double,
    tempDir: File,
    fileType: MimeType
  )(implicit logMarker: LogMarker): Future[File] = {
    logger.info(s"Resizing by $scale (to $dimensions) with libvips", logMarker)
    for {
      outputFile  <- createTempFile(s"resize-", s".${fileType.fileExtension}", tempDir)
      _ <- futureFromTry { Vips.resize(sourceFile, outputFile, scale, qual)}
    } yield outputFile
  }
}
