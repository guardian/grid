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
import com.gu.mediaservice.lib.logging.{GridLogging, LogMarker, Stopwatch, addLogMarkers}
import com.gu.mediaservice.lib.metadata.ImageMetadataConverter
import com.gu.mediaservice.model._
import model.upload.UploadRequest
import org.joda.time.{DateTime, DateTimeZone}
import org.joda.time.format.ISODateTimeFormat
import play.api.libs.json.JsValue

import scala.jdk.CollectionConverters._
import scala.collection.compat._
import scala.concurrent.{ExecutionContext, Future}

object FileMetadataReader extends GridLogging {

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

  def fromIPTCHeaders(image: File, imageId:String)(implicit logMarker: LogMarker): Future[FileMetadata] =
    for {
      metadata <- readMetadata(image)
    }
    yield getMetadataWithIPTCHeaders(metadata, imageId) // FIXME: JPEG, JFIF, Photoshop, GPS, File

  def fromIPTCHeadersWithColorInfo(image: ImageWrapper)(implicit logMarker: LogMarker): Future[FileMetadata] =
    fromIPTCHeadersWithColorInfo(image.file, image.id, image.mimeType)

  def fromIPTCHeadersWithColorInfo(image: File, imageId:String, mimeType: MimeType)(implicit logMarker: LogMarker): Future[FileMetadata] =
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
      icc = redactLongFieldValues(imageId, "ICC")(exportDirectory(metadata, classOf[IccDirectory])),
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
    directory.getXmpProperties.asScala.view.mapValues(nonEmptyTrimmed).collect {
      case (datePattern(key), Some(value)) => key -> ImageMetadataConverter.cleanDate(value, key, imageId)
      case (key, Some(value)) => key -> value
    }.toMap
  }

  private val redactionThreshold = 5000
  val redactionReplacementValue = s"REDACTED (value longer than $redactionThreshold characters, please refer to the metadata stored in the file itself)"
  private def redactLongFieldValues(imageId: String, metadataType: String, exceptions: List[String] = Nil)(props: Map[String, String]) = props.map {
    case (fieldName, value) if value.length > redactionThreshold && !exceptions.exists(fieldName.contains) =>
      logger.debug(s"Redacting '$fieldName' $metadataType field for image $imageId, as it's problematically long (longer than $redactionThreshold characters")
      fieldName -> redactionReplacementValue
    case keyValuePair => keyValuePair
  }

  // We redact most xmp fields because they are usually short in length, or are not required for usual grid operation.
  // These fields are the exceptions - they may be long, and they are displayed to users, so are allowed as an exception.
  private val allowedLongXmpFields = List(
    "dc:description",
    "photoshop:Headline",
    "photoshop:Instructions",
  )

  private def exportRawXmpProperties(metadata: Metadata, imageId:String): Map[String, String] = {
    val directories = metadata.getDirectoriesOfType(classOf[XmpDirectory]).asScala.toList
    val props: Map[String, String] = directories.foldLeft[Map[String, String]](Map.empty)((acc, dir) => {
      // An image can have multiple xmp directories. A directory has multiple xmp properties.
      // A property can be repeated across directories and its value may not be unique.
      // Keep the first value encountered on the basis that there will only be multiple directories
      // if there is no space in the previous one as directories have a maximum size.
      acc ++ xmpDirectoryToMap(dir, imageId).view.filterKeys(k => !acc.contains(k)).toMap
    })
    redactLongFieldValues(imageId, "XMP", allowedLongXmpFields)(props)
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

      // Not to live in a glass house and throw stones, but this looks awfully like a case class
      // Don't change the field names mind.
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


  def orientation(image: File)(implicit logMarker: LogMarker): Future[Option[OrientationMetadata]] = {
    for {
      metadata <- readMetadata(image)
    } yield {

      for {
        exifDirectory <- Option(metadata.getFirstDirectoryOfType(classOf[ExifIFD0Directory]))
        exifOrientation <- Option(exifDirectory.getInteger(ExifDirectoryBase.TAG_ORIENTATION))
        orientation = OrientationMetadata(exifOrientation = Some(exifOrientation))
        orientationWhichTransformsImage <- Seq(orientation).find(_.transformsImage())
      } yield {
        orientationWhichTransformsImage
      }
    }
  }

  def getColorModelInformation(image: File, metadata: Metadata, mimeType: MimeType)(implicit logMarker: LogMarker): Future[Map[String, String]] = {
    val stopWatch = Stopwatch.start
    val source = addImage(image)

    val formatter = format(source)("%r")

    runIdentifyCmd(formatter, useImageMagick = false).map { imageType => getColourInformation(metadata, imageType.headOption, mimeType) }
      .recover { case _ => getColourInformation(metadata, None, mimeType) }.map { result =>
      logger.info(addLogMarkers(stopWatch.elapsed), "Finished getColorModelInformation")
      result
    }
  }

  // bits per sample might be a useful value, eg. "1", "8"; or it might be annoying like "1 bits/component/pixel", "8 8 8 bits/component/pixel"
  // either way we want everything up to the first space
  private def extractBitsPerSample(data: String): Option[String] = data.split(" ").headOption

  private def getFromDirectory(maybeDir: Option[Directory])(value: Int): Option[String] =
    maybeDir.flatMap(dir => Option(dir.getDescription(value)))

  private def getColourInformation(metadata: Metadata, maybeImageType: Option[String], mimeType: MimeType): Map[String, String] = {

    val hasAlpha = maybeImageType.map(imageType => if (imageType.contains("Matte")) "true" else "false")

    val exifDirectory = Option(metadata.getFirstDirectoryOfType(classOf[ExifIFD0Directory]))
    val getFromExifDirectory = getFromDirectory(exifDirectory) _
    val photometricInterpretation = getFromExifDirectory(ExifDirectoryBase.TAG_PHOTOMETRIC_INTERPRETATION)

    mimeType match {
      case Png =>
        val pngDirectory = Option(metadata.getFirstDirectoryOfType(classOf[PngDirectory]))
        val getFromPngDirectory = getFromDirectory(pngDirectory) _
        Map(
          "hasAlpha" -> hasAlpha,
          "colorType" -> getFromPngDirectory(PngDirectory.TAG_COLOR_TYPE),
          "bitsPerSample" -> getFromPngDirectory(PngDirectory.TAG_BITS_PER_SAMPLE).flatMap(extractBitsPerSample),
          "paletteHasTransparency" -> getFromPngDirectory(PngDirectory.TAG_PALETTE_HAS_TRANSPARENCY),
          "paletteSize" -> getFromPngDirectory(PngDirectory.TAG_PALETTE_SIZE),
          "iccProfileName" -> getFromPngDirectory(PngDirectory.TAG_ICC_PROFILE_NAME)
        ).flattenOptions
      case Jpeg =>
        Map(
          "hasAlpha" -> Some("false"),
          "colorType" -> maybeImageType,
          "photometricInterpretation" -> photometricInterpretation,
          "bitsPerSample" -> Some("8")
        ).flattenOptions
      case Tiff =>
        Map(
          "hasAlpha" -> hasAlpha,
          "colorType" -> maybeImageType,
          "photometricInterpretation" -> photometricInterpretation,
          "bitsPerSample" -> getFromExifDirectory(ExifDirectoryBase.TAG_BITS_PER_SAMPLE).flatMap(extractBitsPerSample)
        ).flattenOptions
    }
  }

  private def nonEmptyTrimmed(nullableStr: String): Option[String] =
    Option(nullableStr) map (_.trim) filter (_.nonEmpty)

  private def readMetadata(file: File)(implicit logMarker: LogMarker): Future[Metadata] = {
    val stopwatch = Stopwatch.start
    Future {
      ImageMetadataReader.readMetadata(file)
    }.map { result =>
      logger.info(addLogMarkers(stopwatch.elapsed),"Finished readMetadata")
      result
    }
  }

  // Helper to flatten maps of options
  implicit class MapFlattener[K, V](val map: Map[K, Option[V]]) {
    def flattenOptions: Map[K, V] =
      map.collect { case (key, Some(value)) => key -> value }
  }

}
