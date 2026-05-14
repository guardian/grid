package com.gu.mediaservice.scripts


object Main extends App {

  args.toList match {
    case "GetMapping"       :: as => GetMapping(as)
    case "UpdateMapping"    :: as => UpdateMapping(as)

    case "GetSettings"      :: as => GetSettings(as)
    case "UpdateSettings"   :: as => UpdateSettings(as)

    case "DownloadAllEsIds" :: as => DownloadAllEsIds(as)
    case "EsMetadata"       :: as => EsImageMetadata(as)
    case "BulkDeleteS3Files":: as => BulkDeleteS3Files(as)

    case a :: _ => sys.error(s"Unrecognised command: $a")
    case Nil    => sys.error("Usage: <Command> <args ...>")
  }
}
