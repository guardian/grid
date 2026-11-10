package lib

import com.gu.mediaservice.model.Image

object DownloadMetadata {

  /** Namespaces the id so a Grid-originated value is recognisable, and won't be confused with an
    * `xmp.did:`/`uuid:` identifier written by Adobe tooling earlier in the image's life. */
  private val DocumentIdPrefix = "grid:docid:"

  /**
   * The tags retained on a stripped download, written from Grid's reconciled metadata (so edits made
   * in Grid are reflected, not the values the file was uploaded with).
   *
   * The Grid id is additionally recorded in `XMP-xmpMM:OriginalDocumentID`, prefixed with
   * `grid:docid:`, so a downloaded file can still be traced back to the image it came from.
   */
  def retainedTags(image: Image): Map[String, String] = {
    val metadata = image.metadata
    Map(
      List("MWG:Copyright") -> metadata.copyright,
      List("IPTC:Credit", "XMP-photoshop:Credit") -> metadata.credit,
      List("IPTC:OriginalTransmissionReference", "XMP-photoshop:TransmissionReference") -> metadata.suppliersReference
    ).collect { case (tags, Some(value)) if value.trim.nonEmpty => tags.map(_ -> value) }
      .flatten.toMap + ("XMP-xmpMM:OriginalDocumentID" -> s"$DocumentIdPrefix${image.id}")
  }
}
