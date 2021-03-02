package com.gu.mediaservice.lib.imaging.im4jwrapper

import java.util.concurrent.Executors
import java.io.File

import com.gu.mediaservice.lib.logging.GridLogging
import org.im4java.process.ArrayListOutputConsumer

import scala.collection.JavaConverters._
import scala.concurrent.{ExecutionContext, Future}
import org.im4java.core.{ConvertCmd, IMOperation, IdentifyCmd}
import scalaz.syntax.id._
import com.gu.mediaservice.model.{Bounds, Dimensions}
object ImageMagick extends GridLogging {
  implicit val ctx: ExecutionContext =
    ExecutionContext.fromExecutor(Executors.newFixedThreadPool(Config.imagingThreadPoolSize))

  def addImage(source: File) = (new IMOperation()) <| { op => { op.addImage(source.getAbsolutePath) }}
  def quality(op: IMOperation)(qual: Double) = op <| (_.quality(qual))
  def unsharp(op: IMOperation)(radius: Double, sigma: Double, amount: Double) = op <| (_.unsharp(radius, sigma, amount))
  def stripMeta(op: IMOperation) = op <| (_.strip())
  def stripProfile(op: IMOperation)(profile: String) = op <| (_.p_profile(profile))
  def addDestImage(op: IMOperation)(dest: File) = op <| (_.addImage(dest.getAbsolutePath))
  def crop(op: IMOperation)(b: Bounds): IMOperation = op <| (_.crop(b.width, b.height, b.x, b.y))
  def profile(op: IMOperation)(profileFileLocation: String): IMOperation = op <| (_.profile(profileFileLocation))
  def thumbnail(op: IMOperation)(width: Int): IMOperation = op <| (_.thumbnail(width))
  def resize(op: IMOperation)(maxSize: Int): IMOperation = op <| (_.resize(maxSize, maxSize))
  def scale(op: IMOperation)(dimensions: Dimensions): IMOperation = op <| (_.scale(dimensions.width, dimensions.height))
  def format(op: IMOperation)(definition: String): IMOperation = op <| (_.format(definition))
  def depth(op: IMOperation)(depth: Int): IMOperation = op <| (_.depth(depth))
  def interlace(op: IMOperation)(interlacedHow: String): IMOperation = op <| (_.interlace(interlacedHow))

  def runConvertCmd(op: IMOperation, useImageMagick: Boolean): Future[Unit] = {
    logger.info(s"Using ${if(useImageMagick) { "imagemagick" } else { "graphicsmagick" }} for imaging operation $op")

    Future((new ConvertCmd(!useImageMagick)).run(op))
  }

  def runIdentifyCmd(op: IMOperation): Future[List[String]] = Future {
    val cmd = new IdentifyCmd(true)
    val output = new ArrayListOutputConsumer()
    cmd.setOutputConsumer(output)
    cmd.run(op)
    output.getOutput.asScala.toList
  }
}
