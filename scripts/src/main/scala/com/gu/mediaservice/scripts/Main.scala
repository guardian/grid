package com.gu.mediaservice.scripts


object Main extends App {

  args.toList match {
    case "LoadFromS3Bucket" :: as => LoadFromS3Bucket(as)
    case "Reindex"          :: as => Reindex(as)
    case "MoveIndex"        :: as => MoveIndex(as)
    case "UpdateMapping"    :: as => UpdateMapping(as)
    case a :: _ => sys.error(s"Unrecognised command: $a")
    case Nil    => sys.error("Usage: <Command> <args ...>")
  }

}
