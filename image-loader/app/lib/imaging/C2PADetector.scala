package lib.imaging

import com.drew.imaging.jpeg.{JpegSegmentReader, JpegSegmentType}
import com.drew.imaging.png.{PngChunkReader, PngChunkType}
import com.drew.imaging.tiff.TiffMetadataReader
import com.drew.lang.StreamReader
import com.gu.mediaservice.model.{Jpeg, MimeType, Png, Tiff}

import java.io.{BufferedInputStream, File, FileInputStream}
import java.util.Collections
import scala.jdk.CollectionConverters._
import scala.util.control.NonFatal

/**
 * Lightweight detector for embedded C2PA (Content Credentials) manifests, built entirely on
 * top of the `metadata-extractor` library already used elsewhere in Grid (see FileMetadataReader).
 *
 * This does NOT parse or validate the manifest itself - `metadata-extractor` has no support for
 * C2PA/JUMBF (ISO/IEC 19566-5). It only checks for the presence of the container structures C2PA
 * uses to embed a manifest in JPEG (an APP11 marker segment), PNG (a "caBX" ancillary chunk) and
 * TIFF (a private IFD tag), as defined in the C2PA Technical Specification, Appendix A.2
 * "Embedding manifests into non-BMFF-based assets":
 * https://spec.c2pa.org/specifications/specifications/2.1/specs/C2PA_Specification.html#_embedding_manifests_into_non_bmff_based_assets
 *
 * The mime type is taken from the caller (already known/validated by Grid at upload time) rather
 * than re-detected from the file's bytes: `metadata-extractor`'s own byte-sniffing (FileTypeDetector)
 * is ambiguous for TIFF-based formats - e.g. a plain TIFF whose first IFD starts at the common
 * offset of 8 bytes can be misidentified as a Sony ARW raw file, since the two signatures overlap.
 */
object C2PADetector {

  // JUMBF boxes embedded in a JPEG APP11 segment begin with the ASCII common identifier "JP".
  // See the C2PA Technical Specification, Appendix A.2.1 "Embedding manifests into JPEG":
  // https://spec.c2pa.org/specifications/specifications/2.1/specs/C2PA_Specification.html#_embedding_manifests_into_jpeg
  private val JumbfCommonIdentifier: Array[Byte] = "JP".getBytes("US-ASCII")

  // PNG stores JUMBF/C2PA data in an ancillary chunk named "caBX" (case is significant).
  // See the C2PA Technical Specification, Appendix A.2.2 "Embedding manifests into PNG":
  // https://spec.c2pa.org/specifications/specifications/2.1/specs/C2PA_Specification.html#_embedding_manifests_into_png
  private val PngC2PAChunkType = new PngChunkType("caBX")

  // TIFF stores the raw JUMBF box directly (no "JP" identifier) as the data of a tag with ID
  // 52545 decimal / 0xCD41 hex, tag type 7 (UNDEFINED). See the C2PA Technical Specification,
  // Appendix A.2.5 "Embedding manifests into TIFF-based assets":
  // https://spec.c2pa.org/specifications/specifications/2.1/specs/C2PA_Specification.html#_embedding_manifests_into_tiff_based_assets
  private val TiffC2PATag = 0xCD41

  def hasC2PAManifest(file: File, mimeType: MimeType): Boolean = {
    try {
      mimeType match {
        case Jpeg => hasJpegApp11Jumbf(file)
        case Png => hasPngC2PAChunk(file)
        case Tiff => hasTiffC2PATag(file)
      }
    } catch {
      case NonFatal(_) => false
    }
  }

  private def hasJpegApp11Jumbf(file: File): Boolean = {
    val segments = JpegSegmentReader.readSegments(file, Collections.singletonList(JpegSegmentType.APPB))
    segments.getSegments(JpegSegmentType.APPB).asScala.exists { payload =>
      payload.startsWith(JumbfCommonIdentifier)
    }
  }

  private def hasPngC2PAChunk(file: File): Boolean = {
    val in = new BufferedInputStream(new FileInputStream(file))
    try {
      val chunks = new PngChunkReader().extract(new StreamReader(in), Collections.singleton(PngC2PAChunkType))
      chunks.asScala.nonEmpty
    } finally in.close()
  }

  private def hasTiffC2PATag(file: File): Boolean = {
    val metadata = TiffMetadataReader.readMetadata(file)
    metadata.getDirectories.asScala.exists(_.containsTag(TiffC2PATag))
  }
}
