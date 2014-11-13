package com.gu.mediaservice.scripts


object Main extends App {

  args.toList match {
    case "UpdateStack"      :: as => UpdateStack(as)
    case "CreateStack"      :: as => CreateStack(as)
    case "DeleteStack"      :: as => DeleteStack(as)
    case "LoadFromS3Bucket" :: as => LoadFromS3Bucket(as)
    case "Reindex"          :: as => Reindex(as)
    case "UpdateMapping"    :: as => UpdateMapping(as)
    case a :: _ => sys.error(s"Unrecognised command: $a")
    case Nil    => sys.error("Usage: <Command> <args ...>")
  }

}
