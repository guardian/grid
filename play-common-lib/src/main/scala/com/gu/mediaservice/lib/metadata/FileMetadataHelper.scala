package com.gu.mediaservice.lib.metadata

import com.gu.mediaservice.model.FileMetadata

object FileMetadataHelper {

  def normalisedIccColourSpace(fileMetadata: FileMetadata): Option[String] = {
    fileMetadata.icc.get("Color space") map {
      case "GRAY" => "GRAYSCALE"
      case other  => other
    }
  }

}
