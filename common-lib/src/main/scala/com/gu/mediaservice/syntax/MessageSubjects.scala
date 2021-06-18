package com.gu.mediaservice.syntax

trait MessageSubjects {

  val Image = "image"
  val ReingestImage = "reingest-image" // FIXME: this will conflict with reingest, suggest remove
  val DeleteImage = "delete-image"
  val SoftDeleteImage = "soft-delete-image"
  val UpdateImage = "update-image" // TODO: this appears unused https://logs.gutools.co.uk/s/editorial-tools/goto/f0a03ca3c37261985b2e6292adb8de0f
  val DeleteImageExports = "delete-image-exports"
  val UpdateImageExports = "update-image-exports"
  val UpdateImageUserMetadata = "update-image-user-metadata"
  val UpdateImageUsages = "update-image-usages"
  val ReplaceImageLeases = "replace-image-leases"
  val AddImageLease = "add-image-lease"
  val RemoveImageLease = "remove-image-lease"
  val SetImageCollections = "set-image-collections"
  val DeleteUsages = "delete-usages"
  val UpdateImageSyndicationMetadata = "update-image-syndication-metadata"
  val UpdateImagePhotoshootMetadata = "update-image-photoshoot-metadata"

}

object MessageSubjects extends MessageSubjects
