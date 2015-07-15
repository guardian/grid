package com.gu.mediaservice.lib.config

object MetadataConfig {
  object StaffPhotographers {
    val store = Map(
      "Christopher Thomond" -> "The Guardian",
      "Sean Smith"          -> "The Guardian",
      "David Levene"        -> "The Guardian",
      "David Sillitoe"      -> "The Guardian",
      "Eamonn Mccabe"       -> "The Guardian",
      "Felicity Cloake"     -> "The Guardian",
      "Frank Baron"         -> "The Guardian",
      "Graeme Robertson"    -> "The Guardian",
      "Graham Turner"       -> "The Guardian",
      "Linda Nylind"        -> "The Guardian",
      "Martin Argles"       -> "The Guardian",
      "Martin Godwin"       -> "The Guardian",
      "Mike Bowers"         -> "The Guardian",
      "Murdo Macleod"       -> "The Guardian",
      "Sarah Lee"           -> "The Guardian",
      "Tom Jenkins"         -> "The Guardian",
      "Tristram Kenton"     -> "The Guardian",
      "Andy Hall"           -> "The Observer",
      "Antonio Olmos"       -> "The Observer",
      "Catherine Shaw"      -> "The Observer",
      "Gary Calton"         -> "The Observer",
      "Karen Robinson"      -> "The Observer",
      "Katherine Anne Rose" -> "The Observer",
      "Richard Saker"       -> "The Observer",
      "Sophia Evans"        -> "The Observer",
      "Suki Dhanda"         -> "The Observer"
    )

    val creditBylineMap: Map[String, List[String]] = store
      .groupBy{ case (photographer, publication) => publication }
      .map{ case (publication, photographers) => publication -> photographers.keys.toList }

    val list = store.keys.toList

    def getPublication(name: String): Option[String] = store.get(name)
  }
}
