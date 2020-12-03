package model.upload

import java.io.File

import com.gu.mediaservice.lib.{ImageWrapper, StorableImage}
import com.gu.mediaservice.lib.logging.{LogMarker, Stopwatch}
import com.gu.mediaservice.model.{FileMetadata, MimeType, Png, Tiff}

import scala.concurrent.{ExecutionContext, Future}
import scala.sys.process._

trait OptimiseOps {
  def toOptimisedFile(file: File, imageWrapper: ImageWrapper, tempDir: File)
                     (implicit ec: ExecutionContext, logMarker: LogMarker): Future[(File, MimeType)]
  def isTransformedFilePath(filePath: String): Boolean
  def shouldOptimise(mimeType: Option[MimeType], fileMetadata: FileMetadata): Boolean
  def optimiseMimeType: MimeType
}

object OptimiseWithPngQuant extends OptimiseOps {

  override def optimiseMimeType: MimeType = Png

  def toOptimisedFile(file: File, imageWrapper: ImageWrapper, tempDir: File)
                     (implicit ec: ExecutionContext, logMarker: LogMarker): Future[(File, MimeType)] = Future {

    val optimisedFilePath = tempDir.getAbsolutePath + "/optimisedpng - " + imageWrapper.id + optimiseMimeType.fileExtension
    Stopwatch("pngquant") {
      val result = Seq("pngquant", "--quality", "1-85", file.getAbsolutePath, "--output", optimisedFilePath).!
      if (result>0)
        throw new Exception(s"pngquant failed to convert to optimised png file (rc = $result)")
    }

    val optimisedFile = new File(optimisedFilePath)
    if (optimisedFile.exists()) {
      (optimisedFile, Png)
    } else {
      throw new Exception(s"Attempted to optimise PNG file ${optimisedFile.getPath}")
    }
  }

  def isTransformedFilePath(filePath: String): Boolean = filePath.contains("transformed-")

  def shouldOptimise(mimeType: Option[MimeType], fileMetadata: FileMetadata): Boolean =
    mimeType match {
      case Some(Png) =>
        fileMetadata.colourModelInformation.get("colorType") match {
          case Some("True Color") => true
          case Some("True Color with Alpha") => true
          case _ => false
        }
      case Some(Tiff) => true
      case _ => false
    }
}

