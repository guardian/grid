package com.gu.mediaservice.lib.imaging

import com.gu.mediaservice.lib.BrowserViewableImage
import com.gu.mediaservice.lib.Files.createTempFile
import com.gu.mediaservice.lib.imaging.MagickImageOperations.optimisedMimeType
import com.gu.mediaservice.lib.imaging.vips.{Vips, VipsImage, VipsPngsaveQuantise}
import com.gu.mediaservice.lib.logging.{GridLogging, LogMarker}
import com.gu.mediaservice.model.{Bounds, Jpeg, MimeType, Png}

import java.io.File
import java.nio.file.Files
import scala.concurrent.{ExecutionContext, Future}
import scala.util.{Failure, Try}



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

  private val browserViewableQuality = 85

  def saveImage(image: VipsImage, tempDir: File, quality: Int, mimeType: MimeType, quantise: Boolean): Future[File] = {
    val profile = rgbProfileLocation(false)
    lazy val quantiseOpts = if (quantise) Some(VipsPngsaveQuantise(
      quality = 85, effort = 1, bitdepth = 8
    )) else None
    for {
      outputFile <- createTempFile("crop-", mimeType.fileExtension, tempDir)
      _ <- futureFromTry {
        mimeType match {
          case Jpeg => Vips.saveJpeg(image, outputFile, quality, profile)
          case Png => Vips.savePng(image, outputFile, profile, quantiseOpts)
          case unsupported => Failure(new UnsupportedCropOutputTypeException(unsupported))
        }
      }
    } yield outputFile
  }

  override def transformImage(sourceFile: File, sourceMimeType: Option[MimeType], tempDir: File)
    (implicit logMarker: LogMarker): Future[(File, MimeType)] = {
    logger.info(logMarker, "transforming image with VIPS")
    val profile = rgbProfileLocation(optimised = true)

    val quantise = Some(VipsPngsaveQuantise(
      quality = 85, effort = 1, bitdepth = 8
    ))

    for {
      img <- futureFromTry { Vips.openFile(sourceFile) }
      hasAlpha = Vips.hasAlpha(img)
      outputFile <- createTempFile(s"transformed-", if (hasAlpha) Png.fileExtension else Jpeg.fileExtension, tempDir)
      _ <- futureFromTry {
        if (hasAlpha) Vips.savePng(img, outputFile, profile, quantisation = quantise)
        else Vips.saveJpeg(img, outputFile, browserViewableQuality, profile)
      }
    } yield outputFile -> optimisedMimeType
  }

  override def createThumbnail(
    browserViewableImage: BrowserViewableImage,
    width: Int,
    qual: Double,
    outputFile: File,
    iccColourSpace: Option[String],
    colourModel: Option[String],
    hasAlpha: Boolean
  )(implicit logMarker: LogMarker): Future[(File, MimeType)] = {
    val profile = rgbProfileLocation(false)
    logger.info(logMarker, s"making thumbnail with with VIPS - hasAlpha $hasAlpha")

    for {
      thumb <- futureFromTry { Vips.thumbnail(browserViewableImage.file, width) }
      _ <- futureFromTry {
        if (hasAlpha) Vips.savePng(thumb, outputFile, profile)
        else Vips.saveJpeg(thumb, outputFile, qual.toInt, profile)
      }
    } yield (outputFile, if (hasAlpha) Png else Jpeg)
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
