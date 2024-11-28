package lib

import com.gu.mediaservice.lib.config.{CommonConfig, GridConfigResources}

import java.io.File


class CropperConfig(resources: GridConfigResources) extends CommonConfig(resources) {
  val imgPublishingBucket = string("publishing.image.bucket")

  val canDownloadCrop: Boolean = boolean("canDownloadCrop")

  val imgPublishingHost = string("publishing.image.host")
  // Note: work around CloudFormation not allowing optional parameters
  val imgPublishingSecureHost = stringOpt("publishing.image.secure.host").filterNot(_.isEmpty)

  val rootUri = services.cropperBaseUri
  val apiUri = services.apiBaseUri

  val tempDir: File = new File(stringDefault("crop.output.tmp.dir", "/tmp"))

  val landscapeCropSizingWidths = List(2000, 1000, 500, 140)
  val portraitCropSizingHeights = List(2000, 1000, 500)
}
