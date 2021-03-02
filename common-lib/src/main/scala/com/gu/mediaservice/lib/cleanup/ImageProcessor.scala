package com.gu.mediaservice.lib.cleanup

import com.gu.mediaservice.lib.config.Provider
import com.gu.mediaservice.model.Image

import scala.concurrent.Future

/**
  * An image processor has a single apply method that takes an `Image` and returns an `Image`. This can be used
  * to modify the image in any number of ways and is primarily used to identify and allocate images from different
  * suppliers and also to clean and conform metadata.
  */
trait ImageProcessor extends Provider {
  def initialise(): Unit = {}
  def shutdown(): Future[Unit] = Future.successful(())

  def apply(image: Image): Image
  def description: String = getClass.getCanonicalName
}

trait ComposedImageProcessor extends ImageProcessor {
  def processors: Seq[ImageProcessor]
}

object ImageProcessor {
  val identity: ImageProcessor = new ImageProcessor {
    override def apply(image: Image): Image = image
    override def description: String = "identity"
  }
  /** A convenience method that creates a new ComposedImageProcessor from the provided image processors
    * @param name The string name used to identify this composition
    * @param imageProcessors the underlying image processors that are to be composed
    * @return a new image processor that composes the provided image processors in order
    * */
  def compose(name: String, imageProcessors: ImageProcessor*): ComposedImageProcessor = new ComposedImageProcessor {
    def apply(image: Image): Image =
      imageProcessors
        .foldLeft(image) { case (i, processor) => processor(i) }

    override def description: String = imageProcessors
      .map(_.description)
      .mkString(s"$name(", "; ", ")")

    override def processors: Seq[ImageProcessor] = imageProcessors
  }
}

/**
  * An image processor that simply composes a number of other image processors together.
  * @param imageProcessors the underlying image processors that are to be applied when this imageProcessor is used
  */
class ComposeImageProcessors(val imageProcessors: ImageProcessor*) extends ComposedImageProcessor {
  val underlying: ComposedImageProcessor = ImageProcessor.compose(getClass.getCanonicalName, imageProcessors:_*)
  override def apply(image: Image): Image = underlying.apply(image)
  override def description: String = underlying.description
  override def processors: Seq[ImageProcessor] = underlying.processors
}
