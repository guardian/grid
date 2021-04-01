package com.gu.mediaservice.scripts


object Main extends App {

  args.toList match {
    case "LoadFromS3Bucket" :: as => LoadFromS3Bucket(as)
    case "Reindex"          :: as => Reindex(as)
    case "GetMapping"       :: as => GetMapping(as)
    case "UpdateMapping"    :: as => UpdateMapping(as)
    case "GetSettings"      :: as => GetSettings(as)
    case "UpdateSettings"   :: as => UpdateSettings(as)
    case "ConvertConfig"    :: as => ConvertConfig(as)
    case "BucketMetadata"   :: as => BucketMetadata(as)
    case "DecodeComparator" :: as => DecodeComparator(as)
    case "EnactS3Changes"   :: as => EnactS3Changes(as)
    case "EsMetadata"       :: as => EsImageMetadata(as)
    case "ProposeS3Changes" :: as => ProposeS3Changes(as)
    case "BackfillEditLastModified" :: as => BackfillEditLastModified(as)
    case a :: _ => sys.error(s"Unrecognised command: $a")
    case Nil    => sys.error("Usage: <Command> <args ...>")
  }
}
