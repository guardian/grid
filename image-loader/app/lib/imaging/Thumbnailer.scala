package lib.imaging

import java.io.File

import lib.Config

import com.gu.mediaservice.lib.Files._
import com.gu.mediaservice.lib.imaging.im4jwrapper.ImageMagick._

import scala.concurrent.Future


object Thumbnailer {

  import scala.concurrent.ExecutionContext.Implicits.global

  lazy val imageProfileLocation = s"${play.api.Play.current.path}/srgb.icc"

  def createThumbnail(sourceFile: File, width: Int, qual: Double = 100d): Future[File] = {
    for {
      outputFile <- createTempFile(s"thumb-", ".jpg", Config.tempDir)
      cropSource  = addImage(sourceFile)
      qualified   = quality(cropSource)(qual)
      converted   = profile(qualified)(imageProfileLocation)
      stripped    = stripMeta(converted)
      profiled    = profile(stripped)(imageProfileLocation)
      resized     = thumbnail(profiled)(width)
      addOutput   = addDestImage(resized)(outputFile)
      _          <- runConvertCmd(addOutput)
    } yield outputFile
  }

}
