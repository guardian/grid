package lib

import com.gu.mediaservice.lib.formatting.printDateTime
import com.gu.mediaservice.model.{Bounds, Crop, CropSpec, Dimensions, ExportType}

trait CropSpecMetadata {

  def metadataForCrop(crop: Crop, dimensions: Dimensions): Map[String, String] = {
    val CropSpec(sourceUri, Bounds(x, y, w, h), r, t, rotation) = crop.specification
    val metadata = Map("source" -> sourceUri,
      "bounds-x" -> x,
      "bounds-y" -> y,
      "bounds-width" -> w,
      "bounds-height" -> h,
      "type" -> t.name,
      "author" -> crop.author,
      "date" -> crop.date.map(printDateTime),
      "width" -> dimensions.width,
      "height" -> dimensions.height,
      "aspect-ratio" -> r,
      "rotation" -> rotation
    )

    metadata.collect {
      case (key, Some(value)) => key -> value.toString
      case (key, value) if value != None => key -> value.toString
    }
  }

  def cropSpecFromMetadata(userMetadata: Map[String, String]): Option[CropSpec] = {
    for {
      source <- userMetadata.get("source")
      // we've moved to kebab-case as localstack doesn't like `_`
      // fallback to reading old values for older crops
      // see https://github.com/localstack/localstack/issues/459
      x <- getOrElseOrNone(userMetadata, "bounds-x", "bounds_x").map(_.toInt)
      y <- getOrElseOrNone(userMetadata, "bounds-y", "bounds_y").map(_.toInt)
      w <- getOrElseOrNone(userMetadata, "bounds-width", "bounds_w").map(_.toInt)
      h <- getOrElseOrNone(userMetadata, "bounds-height", "bounds_h").map(_.toInt)
      ratio = getOrElseOrNone(userMetadata, "aspect-ratio", "aspect_ratio")
      exportType = userMetadata.get("type").map(ExportType.valueOf).getOrElse(ExportType.default)
      rotation = userMetadata.get("rotation").map(_.toInt)
    } yield {
      CropSpec(source, Bounds(x, y, w, h), ratio, exportType, rotation)
    }
  }

  private def getOrElseOrNone(theMap: Map[String, String], preferredKey: String, fallbackKey: String): Option[String] = {
    // Return the `preferredKey` value in `theMap` or the `fallbackKey` or `None`
    theMap.get(preferredKey).orElse(theMap.get(fallbackKey))
  }

}
