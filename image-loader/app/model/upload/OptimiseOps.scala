package model.upload

import java.io.File

import com.gu.mediaservice.lib.StorableImage
import com.gu.mediaservice.lib.logging.{LogMarker, Stopwatch}
import com.gu.mediaservice.model.{FileMetadata, MimeType, Png, Tiff}
import model.ImageUploadOpsCfg

import scala.sys.process._

trait OptimiseOps {
  def toOptimisedFile(file: File, storableImage: StorableImage, tempDir: File)
                     (implicit logMarker: LogMarker): (File, MimeType)
  def isTransformedFilePath(filePath: String): Boolean
  def shouldOptimise(mimeType: Option[MimeType], fileMetadata: FileMetadata): Boolean
}

object OptimiseWithPngQuant extends OptimiseOps {

  // TODO This really ought to be a Future, right?
  def toOptimisedFile(file: File, storableImage: StorableImage, tempDir: File)
                     (implicit logMarker: LogMarker): (File, MimeType) = {
    val optimisedFilePath = tempDir.getAbsolutePath + "/optimisedpng - " + storableImage.id + ".png"
    Stopwatch("pngquant") {
      Seq("pngquant", "--quality", "1-85", file.getAbsolutePath, "--output", optimisedFilePath).!
    }
    (new File(optimisedFilePath), Png)
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

