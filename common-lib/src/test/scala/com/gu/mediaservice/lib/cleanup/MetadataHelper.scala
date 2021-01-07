package com.gu.mediaservice.lib.cleanup

import java.net.URI

import com.gu.mediaservice.model._
import org.joda.time.DateTime

trait MetadataHelper {
  def createImageFromMetadata(metadata: (String, String)*): Image = {
    val metadataMap = createImageMetadata(metadata.toMap)
    // TODO: find out why this is here
    val usageRights = NoRights
    Image(
      id = "test",
      metadata = metadataMap,
      uploadTime = DateTime.now,
      uploadedBy = "tester",
      lastModified = None,
      identifiers = Map(),
      uploadInfo = UploadInfo(),
      source = Asset(URI.create("http://example.com/image.jpg"), Some(0), None, None),
      thumbnail = None,
      optimisedPng = None,
      fileMetadata = FileMetadata(),
      userMetadata = None,
      originalMetadata = metadataMap,
      usageRights = usageRights,
      originalUsageRights = usageRights,
      usages = List(),
      exports = List()
    )
  }

  def createImageMetadata(metadata: (String, String)*): ImageMetadata =
    createImageMetadata(metadata.toMap)

  def createImageMetadata(metadata: Map[String, String]): ImageMetadata =
    ImageMetadata(
      dateTaken           = None,
      description         = metadata.get("description"),
      credit              = metadata.get("credit"),
      byline              = metadata.get("byline"),
      bylineTitle         = metadata.get("bylineTitle"),
      title               = metadata.get("title"),
      copyright           = metadata.get("copyright"),
      suppliersReference  = metadata.get("suppliersReference"),
      source              = metadata.get("source"),
      specialInstructions = metadata.get("specialInstructions"),
      keywords            = List(),
      subLocation         = metadata.get("subLocation"),
      city                = metadata.get("city"),
      state               = metadata.get("state"),
      country             = metadata.get("country")
    )
}
