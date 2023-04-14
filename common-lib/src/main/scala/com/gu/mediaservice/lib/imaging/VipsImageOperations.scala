package com.gu.mediaservice.lib.imaging

import com.gu.mediaservice.lib.Files.createTempFile
import com.gu.mediaservice.lib.imaging.vips.{Vips, VipsImage}
import com.gu.mediaservice.lib.logging.GridLogging
import com.gu.mediaservice.model.{Bounds, Dimensions}

import java.io.File
import scala.concurrent.{ExecutionContext, Future}
import scala.util.Try



class VipsImageOperations(val playPath: String)(implicit val ec: ExecutionContext)
  extends GridLogging with ImageOperations
{
  // convert f: () => Try[T] to () => Future[T]
  // Future.fromTry is _not equivalent_! That will run the function synchronously, then transform into a Future.
  // This will start a future, then run the function asynchronously, and then convert the Try into a Future
  private def futureFromTry[T](f: => Try[T]): Future[T] =
  //    Future.unit.transform{ _ => f }
    Future { Future.fromTry(f) }.flatten

  def loadImage(sourceFile: File): Future[VipsImage] = {
    futureFromTry { Vips.openFile(sourceFile) }
  }

  def cropImage(image: VipsImage, bounds: Bounds): Future[VipsImage] = {
    futureFromTry { Vips.extractArea(image, bounds) }
  }

  def resizeImage(image: VipsImage, scale: Double): Future[VipsImage] = {
    futureFromTry { Vips.resize(image, scale) }
  }

  def resizeImages(source: VipsImage, sourceDimensions: Dimensions, targetDimensions: Seq[Dimensions]): Future[Seq[VipsImage]] = {
    Future.sequence(targetDimensions.map { dimension =>
      resizeImage(source, dimension.width / sourceDimensions.width)
    })
  }

  def saveImage(image: VipsImage, tempDir: File, quality: Int): Future[File] = {
    // TODO more filetypes
    for {
      outputFile <- createTempFile("crop-", "jpeg", tempDir)
      _ <- futureFromTry { Vips.saveJpeg(image, outputFile, quality) }
    } yield outputFile
  }

//  override def cropImage(
//    sourceFile: File,
//    sourceMimeType: Option[MimeType],
//    bounds: Bounds,
//    qual: Double,
//    tempDir: File,
//    iccColourSpace: Option[String],
//    colourModel: Option[String],
//    fileType: MimeType,
//    isTransformedFromSource: Boolean
//  )(implicit logMarker: LogMarker): Future[File] = {
//    logger.info(s"Cropping to $bounds with libvips", logMarker)
//    for {
//      outputFile <- createTempFile(s"crop-", s"${fileType.fileExtension}", tempDir)
//      _ <- futureFromTry { Vips.extractArea(sourceFile, outputFile, bounds, qual) }
//    } yield outputFile
//  }

//  override def resizeImage(
//    sourceFile: File,
//    sourceMimeType: Option[MimeType],
//    dimensions: Dimensions,
//    scale: Double,
//    qual: Double,
//    tempDir: File,
//    fileType: MimeType
//  )(implicit logMarker: LogMarker): Future[File] = {
//    logger.info(s"Resizing by $scale (to $dimensions) with libvips", logMarker)
//    for {
//      outputFile  <- createTempFile(s"resize-", s".${fileType.fileExtension}", tempDir)
//      _ <- futureFromTry { Vips.resize(sourceFile, outputFile, scale, qual)}
//    } yield outputFile
//  }
}
