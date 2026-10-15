package lib

import com.gu.mediaservice.model.Image

object DownloadMetadata {

  /**
   * The tags retained on a stripped download, written from Grid's reconciled metadata (so edits made
   * in Grid are reflected, not the values the file was uploaded with).
   *
   * Deliberately the same three fields the cropper retains on every export, including a full-frame
   * one - see `ImageOperations.tagFilter`. `MWG:Copyright` fans out to EXIF:Copyright,
   * IPTC:CopyrightNotice and XMP-dc:Rights in one go; Credit and TransmissionReference have no MWG
   * composite, so their IPTC and XMP homes are written explicitly.
   *
   * The Grid id is additionally recorded in `XMP-xmpMM:OriginalDocumentID` so a downloaded file can
   * still be traced back to the image it came from. Stripping changes the bytes, and a Grid id is a
   * hash of those bytes, so a re-upload would otherwise be indistinguishable from a brand new image.
   * Nothing reads this tag yet - acting on it at upload is a separate piece of work.
   */
  def retainedTags(image: Image): Map[String, String] = {
    val metadata = image.metadata
    Map(
      List("MWG:Copyright") -> metadata.copyright,
      List("IPTC:Credit", "XMP-photoshop:Credit") -> metadata.credit,
      List("IPTC:OriginalTransmissionReference", "XMP-photoshop:TransmissionReference") -> metadata.suppliersReference
    ).collect { case (tags, Some(value)) if value.trim.nonEmpty => tags.map(_ -> value) }
      .flatten.toMap + ("XMP-xmpMM:OriginalDocumentID" -> image.id)
  }
}
