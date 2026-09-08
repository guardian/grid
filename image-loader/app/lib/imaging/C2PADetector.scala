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
 * than re-detected from the file's bytes.
 */
object C2paDetector {

  // An APP11 segment payload carrying a JUMBF box starts with an 8-byte APP11 prefix (CI/EN/Z),
  // followed by the JUMBF box's own LBox+TBox (8 bytes) and its description box's LBox+TBox
  // (8 bytes) - after which comes a 16-byte UUID identifying what the box's content actually is.
  // That puts the UUID we care about at a fixed offset of 24 bytes into the payload. A C2PA
  // manifest store's UUID begins with the ASCII mnemonic "c2pa" - checking for that (rather than
  // just the generic "JP" CI prefix at offset 0) is what tells an actual C2PA manifest apart from
  // some other, non-C2PA use of the same JPEG APP11/JUMBF embedding mechanism. This matches the
  // check the reference C2PA Rust SDK itself performs (see C2PA_MARKER in
  // https://github.com/contentauth/c2pa-rs/blob/main/sdk/src/asset_handlers/jpeg_io.rs).
  // Spec reference - https://spec.c2pa.org/specifications/specifications/2.1/specs/C2PA_Specification.html#_embedding_manifests_into_jpeg
  private val JumbfUuidOffset = 24
  private val C2paManifestStoreUuidMnemonic: Array[Byte] = "c2pa".getBytes("US-ASCII")

  // PNG stores JUMBF/C2PA data in an ancillary chunk named "caBX".
  // Spec reference - https://spec.c2pa.org/specifications/specifications/2.1/specs/C2PA_Specification.html#_embedding_manifests_into_png
  private val PngC2PAChunkType = new PngChunkType("caBX")

  // TIFF stores the raw JUMBF box directly (no "JP" identifier) as the data of a tag with ID
  // 52545 decimal / 0xCD41 hex, tag type 7.
  // Spec reference - https://spec.c2pa.org/specifications/specifications/2.1/specs/C2PA_Specification.html#_embedding_manifests_into_tiff_based_assets
  private val TiffC2PATag = 0xCD41

  def hasC2paManifest(file: File, mimeType: MimeType): Boolean = {
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
      val mnemonicLength = C2paManifestStoreUuidMnemonic.length
      val mnemonicEndOffset = JumbfUuidOffset + mnemonicLength
      val isLongEnoughToContainMnemonic = payload.length >= mnemonicEndOffset
      val mnemonicInPayload = payload.slice(JumbfUuidOffset, mnemonicEndOffset)

      isLongEnoughToContainMnemonic && mnemonicInPayload.sameElements(C2paManifestStoreUuidMnemonic)
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
