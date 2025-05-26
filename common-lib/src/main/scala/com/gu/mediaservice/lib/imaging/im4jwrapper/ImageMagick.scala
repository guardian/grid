package com.gu.mediaservice.lib.imaging.im4jwrapper

import java.util.concurrent.Executors
import java.io.File
import com.gu.mediaservice.lib.logging.{GridLogging, LogMarker, Stopwatch}
import org.im4java.process.ArrayListOutputConsumer

import scala.jdk.CollectionConverters._
import scala.concurrent.{ExecutionContext, Future}
import org.im4java.core.{ConvertCmd, IMOperation, IdentifyCmd}
import com.gu.mediaservice.model.{Bounds, Dimensions}


object ImageMagick extends GridLogging {
  implicit val ctx: ExecutionContext =
    ExecutionContext.fromExecutor(Executors.newFixedThreadPool(Config.imagingThreadPoolSize))

  def addImage(source: File): IMOperation = {
    val op = new IMOperation
    op.addImage(source.getAbsolutePath)
    op
  }
  def quality(op: IMOperation)(qual: Double): IMOperation = {
    op.quality(qual)
    op
  }
  def unsharp(op: IMOperation)(radius: Double, sigma: Double, amount: Double): IMOperation = {
    op.unsharp(radius, sigma, amount)
    op
  }
  def stripMeta(op: IMOperation): IMOperation = {
    op.strip()
    op
  }
  def stripProfile(op: IMOperation)(profile: String): IMOperation = {
    op.p_profile(profile)
    op
  }
  def addDestImage(op: IMOperation)(dest: File): IMOperation = {
    op.addImage(dest.getAbsolutePath)
    op
  }
  def crop(op: IMOperation)(b: Bounds): IMOperation = {
    op.crop(b.width, b.height, b.x, b.y)
    op
  }
  def profile(op: IMOperation)(profileFileLocation: String): IMOperation = {
    op.profile(profileFileLocation)
    op
  }

  def rotate(op: IMOperation)(angle: Double): IMOperation = {
    op.rotate(angle)
    op
  }

  def thumbnail(op: IMOperation)(width: Int): IMOperation = {
    op.thumbnail(width)
    op
  }
  def resize(op: IMOperation)(maxSize: Int): IMOperation = {
    op.resize(maxSize, maxSize)
    op
  }
  def scale(op: IMOperation)(dimensions: Dimensions): IMOperation = {
    op.scale(dimensions.width, dimensions.height)
    op
  }
  def format(op: IMOperation)(definition: String): IMOperation = {
    op.format(definition)
    op
  }
  def depth(op: IMOperation)(depth: Int): IMOperation = {
    op.depth(depth)
    op
  }
  def interlace(op: IMOperation)(interlacedHow: String): IMOperation = {
    op.interlace(interlacedHow)
    op
  }
  def setBackgroundColour(op: IMOperation)(backgroundColour: String): IMOperation = {
    op.background(backgroundColour)
    op
  }
  def flatten(op: IMOperation): IMOperation = {
    op.flatten()
    op
  }

  def runIdentifyCmd(op: IMOperation, useImageMagick: Boolean)(implicit logMarker: LogMarker): Future[List[String]] = {
    Stopwatch.async(s"Using ${if (useImageMagick) "imagemagick" else "graphicsmagick"} for imaging identification operation '$op'") {
      Future {
        val cmd = new IdentifyCmd(!useImageMagick)
        val output = new ArrayListOutputConsumer()
        cmd.setOutputConsumer(output)
        cmd.run(op)
        output.getOutput.asScala.toList
      }
    }
  }
}
