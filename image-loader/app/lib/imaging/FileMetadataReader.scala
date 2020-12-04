package lib.imaging

import java.io.File
import java.util.concurrent.Executors

import com.adobe.internal.xmp.XMPMetaFactory
import com.drew.imaging.ImageMetadataReader
import com.drew.metadata.exif.{ExifDirectoryBase, ExifIFD0Directory, ExifSubIFDDirectory}
import com.drew.metadata.icc.IccDirectory
import com.drew.metadata.iptc.IptcDirectory
import com.drew.metadata.jpeg.JpegDirectory
import com.drew.metadata.png.PngDirectory
import com.drew.metadata.xmp.XmpDirectory
import com.drew.metadata.{Directory, Metadata}
import com.gu.mediaservice.lib.{ImageWrapper, StorableImage}
import com.gu.mediaservice.lib.imaging.im4jwrapper.ImageMagick._
import com.gu.mediaservice.lib.metadata.ImageMetadataConverter
import com.gu.mediaservice.model._
import model.upload.UploadRequest
import org.joda.time.{DateTime, DateTimeZone}
import org.joda.time.format.ISODateTimeFormat
import play.api.libs.json.JsValue

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

  def fromIPTCHeaders(image: File, imageId:String): Future[FileMetadata] =
    for {
      metadata <- readMetadata(image)
    }
    yield getMetadataWithIPTCHeaders(metadata, imageId) // FIXME: JPEG, JFIF, Photoshop, GPS, File

  def fromIPTCHeadersWithColorInfo(image: ImageWrapper): Future[FileMetadata] =
    fromIPTCHeadersWithColorInfo(image.file, image.id, image.mimeType)

  def fromIPTCHeadersWithColorInfo(image: File, imageId:String, mimeType: MimeType): Future[FileMetadata] =
    for {
      metadata <- readMetadata(image)
      colourModelInformation <- getColorModelInformation(image, metadata, mimeType)
    }
    yield getMetadataWithIPTCHeaders(metadata, imageId).copy(colourModelInformation = colourModelInformation)

  private def getMetadataWithIPTCHeaders(metadata: Metadata, imageId:String): FileMetadata =
    FileMetadata(
      iptc = exportDirectory(metadata, classOf[IptcDirectory]),
      exif = exportDirectory(metadata, classOf[ExifIFD0Directory]),
      exifSub = exportDirectory(metadata, classOf[ExifSubIFDDirectory]),
      xmp = exportXmpPropertiesInTransformedSchema(metadata, imageId),
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
  private def xmpDirectoryToMap(directory: XmpDirectory, imageId: String): Map[String, String] = {
    directory.getXmpProperties.asScala.toMap.mapValues(nonEmptyTrimmed).collect {
      case (datePattern(key), Some(value)) => key -> ImageMetadataConverter.cleanDate(value, key, imageId)
      case (key, Some(value)) => key -> value
    }
  }
  private def exportRawXmpProperties(metadata: Metadata, imageId:String): Map[String, String] = {
    val directories = metadata.getDirectoriesOfType(classOf[XmpDirectory]).asScala.toList
    val props: Map[String, String] = directories.foldLeft[Map[String, String]](Map.empty)((acc, dir) => {
      // An image can have multiple xmp directories. A directory has multiple xmp properties.
      // A property can be repeated across directories and its value may not be unique.
      // Keep the first value encountered on the basis that there will only be multiple directories
      // if there is no space in the previous one as directories have a maximum size.
      acc ++ xmpDirectoryToMap(dir, imageId).filterKeys(k => !acc.contains(k))
    })
    props
  }
  private def exportXmpPropertiesInTransformedSchema(metadata: Metadata, imageId:String): Map[String, JsValue] = {
    val props = exportRawXmpProperties(metadata, imageId)
    FileMetadataAggregator.aggregateMetadataMap(props)
  }

  // Getty made up their own XMP namespace.
  // We're awaiting actual documentation of the properties available, so
  // this only extracts a small subset of properties as a means to identify Getty images.
  private def exportGettyDirectory(metadata: Metadata, imageId:String): Map[String, String] = {
      val xmpProperties = exportRawXmpProperties(metadata, imageId)

      def readProperty(name: String): Option[String] = xmpProperties.get(name)

      def readAssetId: Option[String] = readProperty("GettyImagesGIFT:AssetId").orElse(readProperty("GettyImagesGIFT:AssetID"))

      Map(
        "Asset ID" -> readAssetId,
        "Call For Image" -> readProperty("GettyImagesGIFT:CallForImage"),
        "Camera Filename" -> readProperty("GettyImagesGIFT:CameraFilename"),
        "Camera Make Model" -> readProperty("GettyImagesGIFT:CameraMakeModel"),
        "Composition" -> readProperty("GettyImagesGIFT:Composition"),
        "Exclusive Coverage" -> readProperty("GettyImagesGIFT:ExclusiveCoverage"),
        "Image Rank" -> readProperty("GettyImagesGIFT:ImageRank"),
        "Original Create Date Time" -> readProperty("GettyImagesGIFT:OriginalCreateDateTime"),
        "Original Filename" -> readProperty("GettyImagesGIFT:OriginalFilename"),
        "Personality" -> readProperty("GettyImagesGIFT:Personality"),
        "Time Shot" -> readProperty("GettyImagesGIFT:TimeShot")
      ).flattenOptions
  }

  private def dateToUTCString(date: DateTime): String = ISODateTimeFormat.dateTime.print(date.withZone(DateTimeZone.UTC))

  def dimensions(image: File, mimeType: Option[MimeType]): Future[Option[Dimensions]] =
    for {
      metadata <- readMetadata(image)
    }
    yield {

      mimeType match {

        case Some(Jpeg) => for {
          jpegDir <- Option(metadata.getFirstDirectoryOfType(classOf[JpegDirectory]))

        } yield Dimensions(jpegDir.getImageWidth, jpegDir.getImageHeight)

        case Some(Png) => for {
          pngDir <- Option(metadata.getFirstDirectoryOfType(classOf[PngDirectory]))

        } yield {
          val width = pngDir.getInt(PngDirectory.TAG_IMAGE_WIDTH)
          val height = pngDir.getInt(PngDirectory.TAG_IMAGE_HEIGHT)
          Dimensions(width, height)
        }

        case Some(Tiff) => for {
          exifDir <- Option(metadata.getFirstDirectoryOfType(classOf[ExifIFD0Directory]))

        } yield {
          val width = exifDir.getInt(ExifDirectoryBase.TAG_IMAGE_WIDTH)
          val height = exifDir.getInt(ExifDirectoryBase.TAG_IMAGE_HEIGHT)
          Dimensions(width, height)
        }

        case _ => None

      }
    }

  def getColorModelInformation(image: File, metadata: Metadata, mimeType: MimeType): Future[Map[String, String]] = {

    val source = addImage(image)

    val formatter = format(source)("%r")

    runIdentifyCmd(formatter).map{ imageType => getColourInformation(metadata, imageType.headOption, mimeType) }
      .recover { case _ => getColourInformation(metadata, None, mimeType) }
  }

  private def getColourInformation(metadata: Metadata, maybeImageType: Option[String], mimeType: MimeType): Map[String, String] = {

    val hasAlpha = maybeImageType.map(imageType => if (imageType.contains("Matte")) "true" else "false")

    mimeType match {
      case Png => val metaDir = metadata.getFirstDirectoryOfType(classOf[PngDirectory])
        Map(
          "hasAlpha" -> hasAlpha,
          "colorType" -> Option(metaDir.getDescription(PngDirectory.TAG_COLOR_TYPE)),
          "bitsPerSample" -> Option(metaDir.getDescription(PngDirectory.TAG_BITS_PER_SAMPLE)),
          "paletteHasTransparency" -> Option(metaDir.getDescription(PngDirectory.TAG_PALETTE_HAS_TRANSPARENCY)),
          "paletteSize" -> Option(metaDir.getDescription(PngDirectory.TAG_PALETTE_SIZE)),
          "iccProfileName" -> Option(metaDir.getDescription(PngDirectory.TAG_ICC_PROFILE_NAME))
        ).flattenOptions
      case _ => val metaDir = Option(metadata.getFirstDirectoryOfType(classOf[ExifIFD0Directory]))
        Map(
          "hasAlpha" -> hasAlpha,
          "colorType" -> maybeImageType,
          "photometricInterpretation" -> metaDir.map(_.getDescription(ExifDirectoryBase.TAG_PHOTOMETRIC_INTERPRETATION)),
          "bitsPerSample" -> metaDir.map(_.getDescription(ExifDirectoryBase.TAG_BITS_PER_SAMPLE))
        ).flattenOptions
    }



  }

  private def nonEmptyTrimmed(nullableStr: String): Option[String] =
    Option(nullableStr) map (_.trim) filter (_.nonEmpty)

  private def readMetadata(file: File): Future[Metadata] = Future {
    ImageMetadataReader.readMetadata(file)
  }

  // Helper to flatten maps of options
  implicit class MapFlattener[K, V](val map: Map[K, Option[V]]) {
    def flattenOptions: Map[K, V] =
      map.collect { case (key, Some(value)) => key -> value }
  }

}
