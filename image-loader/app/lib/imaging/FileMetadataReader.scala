package lib.imaging

import java.io.File
import java.util.concurrent.Executors
import scala.collection.JavaConversions._
import scala.concurrent.{ExecutionContext, Future}

import com.drew.imaging.ImageMetadataReader
import com.drew.metadata.{Metadata, Directory}
import com.drew.metadata.iptc.IptcDirectory
import com.drew.metadata.jpeg.JpegDirectory
import com.drew.metadata.png.PngDirectory
import com.drew.metadata.icc.IccDirectory
import com.drew.metadata.exif.{ExifSubIFDDirectory, ExifIFD0Directory}
import com.drew.metadata.xmp.XmpDirectory

import com.gu.mediaservice.model.{Dimensions, FileMetadata}
import com.gu.mediaservice.lib.imaging.im4jwrapper.ImageMagick._


object FileMetadataReader {

  private implicit val ctx: ExecutionContext =
    ExecutionContext.fromExecutor(Executors.newCachedThreadPool)

  def fromIPTCHeaders(image: File): Future[FileMetadata] =
    for {
      metadata <- readMetadata(image)
    }
    yield {
      // FIXME: JPEG, JFIF, Photoshop, GPS, File

     getMetadataWithICPTCHeaders(metadata)
    }

  def fromICPTCHeadersWithColorInfo(image: File): Future[FileMetadata] =
    for {
      metadata               <- readMetadata(image)
      colourModelInformation <- getColorModelInformation(image, metadata)
    }
    yield {
      getMetadataWithICPTCHeaders(metadata).copy(colourModelInformation = colourModelInformation)
    }

  private def getMetadataWithICPTCHeaders(metadata: Metadata): FileMetadata = {

    FileMetadata(
      exportDirectory(metadata, classOf[IptcDirectory]),
      exportDirectory(metadata, classOf[ExifIFD0Directory]),
      exportDirectory(metadata, classOf[ExifSubIFDDirectory]),
      exportDirectory(metadata, classOf[XmpDirectory]),
      exportDirectory(metadata, classOf[IccDirectory]),
      exportGettyDirectory(metadata),
      None,
      Map()
    )
  }

  // Export all the metadata in the directory
  private def exportDirectory[T <: Directory](metadata: Metadata, directoryClass: Class[T]): Map[String, String] =
    Option(metadata.getFirstDirectoryOfType(directoryClass)) map { directory =>
      directory.getTags.
        filter(tag => tag.hasTagName()).
        // Ignore seemingly useless "Padding" fields
        // see: https://github.com/drewnoakes/metadata-extractor/issues/100
        filter(tag => tag.getTagName != "Padding").
        // Ignore meta-metadata
        filter(tag => tag.getTagName != "XMP Value Count").
        flatMap { tag =>
          nonEmptyTrimmed(tag.getDescription) map { value => tag.getTagName -> value }
        }.toMap
    } getOrElse Map()

  // Getty made up their own XMP namespace.
  // We're awaiting actual documentation of the properties available, so
  // this only extracts a small subset of properties as a means to identify Getty images.
  private def exportGettyDirectory(metadata: Metadata): Map[String, String] =
    Option(metadata.getFirstDirectoryOfType(classOf[XmpDirectory])) map { directory =>
      val xmpProperties = directory.getXmpProperties.toMap

      def readProperty(name: String): Option[String] = xmpProperties.get(name) flatMap nonEmptyTrimmed

      def readAssetId : Option[String] = {
        readProperty("GettyImagesGIFT:AssetId").orElse(readProperty("GettyImagesGIFT:AssetID"))
      }

      Map(
        "Asset ID"                  -> readAssetId,
        "Call For Image"            -> readProperty("GettyImagesGIFT:CallForImage"),
        "Camera Filename"           -> readProperty("GettyImagesGIFT:CameraFilename"),
        "Camera Make Model"         -> readProperty("GettyImagesGIFT:CameraMakeModel"),
        "Composition"               -> readProperty("GettyImagesGIFT:Composition"),
        "Exclusive Coverage"        -> readProperty("GettyImagesGIFT:ExclusiveCoverage"),
        "Image Rank"                -> readProperty("GettyImagesGIFT:ImageRank"),
        "Original Create Date Time" -> readProperty("GettyImagesGIFT:OriginalCreateDateTime"),
        "Original Filename"         -> readProperty("GettyImagesGIFT:OriginalFilename"),
        "Personality"               -> readProperty("GettyImagesGIFT:Personality"),
        "Time Shot"                 -> readProperty("GettyImagesGIFT:TimeShot")
      ).flattenOptions
    } getOrElse Map()


  def dimensions(image: File, mimeType: Option[String]): Future[Option[Dimensions]] =
    for {
      metadata <- readMetadata(image)
    }
    yield {

      mimeType match {

        case Some("image/jpeg") => for {
          jpegDir <- Option(metadata.getFirstDirectoryOfType(classOf[JpegDirectory]))

        } yield Dimensions(jpegDir.getImageWidth, jpegDir.getImageHeight)

        case Some("image/png") => for {
          pngDir <- Option(metadata.getFirstDirectoryOfType(classOf[PngDirectory]))

        } yield {
          val width = pngDir.getInt(PngDirectory.TAG_IMAGE_WIDTH)
          val height = pngDir.getInt(PngDirectory.TAG_IMAGE_HEIGHT)
          Dimensions(width, height)
        }

        case _ => None

      }
    }

  def getColorModelInformation(image: File, metadata: Metadata): Future[Map[String, String]] = {

    val source = addImage(image)

    val formatter = format(source)("%A")

    runIdentifyCmd(formatter).map{ hasAlpha => getColourInformation(metadata, hasAlpha.headOption) }
      .recover { case _ => getColourInformation(metadata, None) }
  }

  private def getColourInformation(metadata: Metadata, hasAlpha: Option[String]): Map[String, String] = {
    val pngDir = metadata.getFirstDirectoryOfType(classOf[PngDirectory])

    Map(
      "hasAlpha" -> hasAlpha,
      "colorType" -> Option(pngDir.getDescription(PngDirectory.TAG_COLOR_TYPE)),
      "bitsPerSample" -> Option(pngDir.getDescription(PngDirectory.TAG_BITS_PER_SAMPLE)),
      "paletteHasTransparency" -> Option(pngDir.getDescription(PngDirectory.TAG_PALETTE_HAS_TRANSPARENCY)),
      "paletteSize" -> Option(pngDir.getDescription(PngDirectory.TAG_PALETTE_SIZE)),
      "iccProfileName" -> Option(pngDir.getDescription(PngDirectory.TAG_ICC_PROFILE_NAME))
    ).flattenOptions

  }

  private def nonEmptyTrimmed(nullableStr: String): Option[String] =
    Option(nullableStr) map (_.trim) filter (_.nonEmpty)

  private def readMetadata(file: File): Future[Metadata] =
    Future(ImageMetadataReader.readMetadata(file))

  // Helper to flatten maps of options
  implicit class MapFlattener[K, V](val map: Map[K, Option[V]]) {
    def flattenOptions: Map[K, V] =
      map.collect { case (key, Some(value)) => key -> value }
  }

}
