package lib.imaging

import java.io.File
import java.util.concurrent.Executors

import com.adobe.xmp.XMPMetaFactory
import com.drew.imaging.ImageMetadataReader
import com.drew.metadata.exif.{ExifDirectoryBase, ExifIFD0Directory, ExifSubIFDDirectory}
import com.drew.metadata.icc.IccDirectory
import com.drew.metadata.iptc.IptcDirectory
import com.drew.metadata.jpeg.JpegDirectory
import com.drew.metadata.png.PngDirectory
import com.drew.metadata.xmp.XmpDirectory
import com.drew.metadata.{Directory, Metadata}
import com.gu.mediaservice.lib.imaging.im4jwrapper.ImageMagick._
import com.gu.mediaservice.lib.metadata.ImageMetadataConverter
import com.gu.mediaservice.model.FileMetadata.StringOrStrings
import com.gu.mediaservice.model.{Dimensions, FileMetadata}
import org.joda.time.format.ISODateTimeFormat
import org.joda.time.{DateTime, DateTimeZone}

import scala.collection.JavaConverters._
import scala.concurrent.{ExecutionContext, Future}

object FileMetadataReader {

  /*
  The XMPMetaFactory in the Adobe xmpcore library keeps a stateful list of previously seen prefix (namespace) to schema
  mappings in a `XMPSchemaRegistry`

  Let:
  - Image A namespace Getty schema (http://xmp.gettyimages.com/gift/1.0/) with `prefix0`
  - Image B namespace Getty schema (http://xmp.gettyimages.com/gift/1.0/) with `GettyImagesGIFT`

  If we process Image A first, the `XMPSchemaRegistry` will say the Getty namespace is prefixed with `prefix0`.
  When we process Image B, we'll see it uses the Getty namespace with the `GettyImagesGIFT` prefix,
  but that the namespace is in the `XMPSchemaRegistry` from Image A, so we'll set the prefix to `prefix0`.

  Conversely, if we process Image B first, the `XMPSchemaRegistry` cache will be in the desired state and Image A will
  be ingested correctly. That is, it's pot luck!

  As a workaround, register the Getty prefix as `GettyImagesGIFT` early to force Getty metadata to use the correct prefix.
  This is what ExifTool does - https://github.com/exiftool/exiftool/blob/3339862c31076f9db30270b3965ac1c49ee0687a/lib/Image/ExifTool/XMP.pm#L184
   */
  private val namespaces = Map(
    "GettyImagesGIFT" -> "http://xmp.gettyimages.com/gift/1.0/"
  )
  for ((prefix, namespaceUri) <- namespaces) XMPMetaFactory.getSchemaRegistry.registerNamespace(namespaceUri, prefix)

  private implicit val ctx: ExecutionContext =
    ExecutionContext.fromExecutor(Executors.newCachedThreadPool)

  def fromIPTCHeaders(image: File, imageId: String): Future[FileMetadata] =
    for {
      metadata <- readMetadata(image)
    }
      yield getMetadataWithICPTCHeaders(metadata, imageId) // FIXME: JPEG, JFIF, Photoshop, GPS, File

  def fromICPTCHeadersWithColorInfo(image: File, imageId: String, mimeType: String): Future[FileMetadata] =
    for {
      metadata <- readMetadata(image)
      colourModelInformation <- getColorModelInformation(image, metadata, mimeType)
    }
      yield getMetadataWithICPTCHeaders(metadata, imageId).copy(colourModelInformation = colourModelInformation)

  private def getMetadataWithICPTCHeaders(metadata: Metadata, imageId: String): FileMetadata =
    FileMetadata(
      iptc = exportDirectory(metadata, classOf[IptcDirectory]),
      exif = exportDirectory(metadata, classOf[ExifIFD0Directory]),
      exifSub = exportDirectory(metadata, classOf[ExifSubIFDDirectory]),
      xmp = exportXmpProperties(metadata, imageId),
      icc = exportDirectory(metadata, classOf[IccDirectory]),
      getty = exportGettyDirectory(metadata, imageId),
      colourModel = None,
      colourModelInformation = Map()
    )

  // Export all the metadata in the directory
  private def exportDirectory[T <: Directory](metadata: Metadata, directoryClass: Class[T]): Map[String, String] =
    Option(metadata.getFirstDirectoryOfType(directoryClass)) map { directory =>
      val metaTagsMap = directory.getTags.asScala.
        filter(tag => tag.hasTagName).
        // Ignore seemingly useless "Padding" fields
        // see: https://github.com/drewnoakes/metadata-extractor/issues/100
        filter(tag => tag.getTagName != "Padding").
        // Ignore meta-metadata
        filter(tag => tag.getTagName != "XMP Value Count").
        flatMap { tag =>
          nonEmptyTrimmed(tag.getDescription) map { value => tag.getTagName -> value }
        }.toMap

      directory match {
        case d: IptcDirectory =>
          val dateTimeCreated =
            Option(d.getDateCreated).map(d => dateToUTCString(new DateTime(d))).map("Date Time Created Composite" -> _)

          val digitalDateTimeCreated =
            Option(d.getDigitalDateCreated).map(d => dateToUTCString(new DateTime(d))).map("Digital Date Time Created Composite" -> _)

          metaTagsMap ++ dateTimeCreated ++ digitalDateTimeCreated

        case d: ExifSubIFDDirectory =>
          val dateTimeCreated = Option(d.getDateOriginal).map(d => dateToUTCString(new DateTime(d))).map("Date/Time Original Composite" -> _)
          metaTagsMap ++ dateTimeCreated

        case _ => metaTagsMap
      }
    } getOrElse Map()

  private val datePattern = "(.*[Dd]ate.*)".r

  private def exportXmpProperties(metadata: Metadata, imageId: String): Map[String, StringOrStrings] = {

    val props = Option(metadata.getFirstDirectoryOfType(classOf[XmpDirectory])) map { directory =>
      directory.getXmpProperties.asScala.toMap.mapValues(nonEmptyTrimmed).collect {
        case (datePattern(key), Some(value)) => key -> ImageMetadataConverter.cleanDate(value, key, imageId)
        case (key, Some(value)) => key -> value
      }
    } getOrElse Map()

    FileMetadata.aggregateMetadataMap(props)
  }

  // Getty made up their own XMP namespace.
  // We're awaiting actual documentation of the properties available, so
  // this only extracts a small subset of properties as a means to identify Getty images.
  private def exportGettyDirectory(metadata: Metadata, imageId: String): Map[String, String] = {
    val xmpProperties = exportXmpProperties(metadata, imageId)

    def readXmpProp(name: String) = FileMetadata.readStringOrListHeadProp(name, xmpProperties)


    def readAssetId: Option[String] = readXmpProp("GettyImagesGIFT:AssetId").orElse(readXmpProp("GettyImagesGIFT:AssetID"))

    Map(
      "Asset ID" -> readAssetId,
      "Call For Image" -> readXmpProp("GettyImagesGIFT:CallForImage"),
      "Camera Filename" -> readXmpProp("GettyImagesGIFT:CameraFilename"),
      "Camera Make Model" -> readXmpProp("GettyImagesGIFT:CameraMakeModel"),
      "Composition" -> readXmpProp("GettyImagesGIFT:Composition"),
      "Exclusive Coverage" -> readXmpProp("GettyImagesGIFT:ExclusiveCoverage"),
      "Image Rank" -> readXmpProp("GettyImagesGIFT:ImageRank"),
      "Original Create Date Time" -> readXmpProp("GettyImagesGIFT:OriginalCreateDateTime"),
      "Original Filename" -> readXmpProp("GettyImagesGIFT:OriginalFilename"),
      "Personality" -> readXmpProp("GettyImagesGIFT:Personality"),
      "Time Shot" -> readXmpProp("GettyImagesGIFT:TimeShot")
    ).flattenOptions
  }

  private def dateToUTCString(date: DateTime): String = ISODateTimeFormat.dateTime.print(date.withZone(DateTimeZone.UTC))

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

          case Some("image/tiff") => for {
            exifDir <- Option(metadata.getFirstDirectoryOfType(classOf[ExifIFD0Directory]))

          } yield {
            val width = exifDir.getInt(ExifDirectoryBase.TAG_IMAGE_WIDTH)
            val height = exifDir.getInt(ExifDirectoryBase.TAG_IMAGE_HEIGHT)
            Dimensions(width, height)
          }

          case _ => None

        }
      }

  def getColorModelInformation(image: File, metadata: Metadata, mimeType: String): Future[Map[String, String]] = {

    val source = addImage(image)

    val formatter = format(source)("%r")

    runIdentifyCmd(formatter).map { imageType => getColourInformation(metadata, imageType.headOption, mimeType) }
      .recover { case _ => getColourInformation(metadata, None, mimeType) }
  }

  private def getColourInformation(metadata: Metadata, maybeImageType: Option[String], mimeType: String): Map[String, String] = {

    val hasAlpha = maybeImageType.map(imageType => if (imageType.contains("Matte")) "true" else "false")

    mimeType match {
      case "image/png" => val metaDir = metadata.getFirstDirectoryOfType(classOf[PngDirectory])
        Map(
          "hasAlpha" -> hasAlpha,
          "colorType" -> Option(metaDir.getDescription(PngDirectory.TAG_COLOR_TYPE)),
          "bitsPerSample" -> Option(metaDir.getDescription(PngDirectory.TAG_BITS_PER_SAMPLE)),
          "paletteHasTransparency" -> Option(metaDir.getDescription(PngDirectory.TAG_PALETTE_HAS_TRANSPARENCY)),
          "paletteSize" -> Option(metaDir.getDescription(PngDirectory.TAG_PALETTE_SIZE)),
          "iccProfileName" -> Option(metaDir.getDescription(PngDirectory.TAG_ICC_PROFILE_NAME))
        ).flattenOptions
      case _ => val metaDir = metadata.getFirstDirectoryOfType(classOf[ExifIFD0Directory])
        Map(
          "hasAlpha" -> hasAlpha,
          "colorType" -> maybeImageType,
          "photometricInterpretation" -> Option(metaDir.getDescription(ExifDirectoryBase.TAG_PHOTOMETRIC_INTERPRETATION)),
          "bitsPerSample" -> Option(metaDir.getDescription(ExifDirectoryBase.TAG_BITS_PER_SAMPLE))
        ).flattenOptions
    }


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
