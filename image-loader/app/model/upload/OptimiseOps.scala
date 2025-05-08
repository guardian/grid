package model.upload

import java.io.File

import com.gu.mediaservice.lib.{ImageWrapper, StorableImage}
import com.gu.mediaservice.lib.logging.{LogMarker, Stopwatch}
import com.gu.mediaservice.model.{FileMetadata, MimeType, Png, Tiff}
import com.gu.mediaservice.lib.logging.MarkerMap

import scala.concurrent.{ExecutionContext, Future}
import scala.sys.process._
import scala.jdk.CollectionConverters._

trait OptimiseOps {
  def toOptimisedFile(file: File, imageWrapper: ImageWrapper, tempDir: File)
                     (implicit ec: ExecutionContext, logMarker: LogMarker): Future[(File, MimeType)]
  def isTransformedFilePath(filePath: String): Boolean
  def shouldOptimise(mimeType: Option[MimeType]): Boolean
  def optimiseMimeType: MimeType
}

object OptimiseWithPngQuant extends OptimiseOps {

  override def optimiseMimeType: MimeType = Png

  def toOptimisedFile(file: File, imageWrapper: ImageWrapper, optimisedFile: File)
                     (implicit ec: ExecutionContext, logMarker: LogMarker): Future[(File, MimeType)] = Future {

    val marker = MarkerMap(
      "fileName" -> file.getName()
    )

    Stopwatch("pngquant") {
      val result = Seq("pngquant", "-s10", "--quality", "1-85", file.getAbsolutePath,
        "--force", "--output", optimisedFile.getAbsolutePath
      ).!
      if (result > 0)
        throw new Exception(s"pngquant failed to convert to optimised png file (rc = $result)")
    }(marker)

    if (optimisedFile.exists()) {
      (optimisedFile, optimiseMimeType)
    } else {
      throw new Exception(s"Attempted to optimise PNG file ${optimisedFile.getPath}")
    }
  }

  def isTransformedFilePath(filePath: String): Boolean = filePath.contains("transformed-")

  def shouldOptimise(mimeType: Option[MimeType]): Boolean = false
}
