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

    val creditBylineMap = store.groupBy(_._2).map(o => o._1 -> o._2.keys.toList)
    val list = store.keys.toList

    def getOrganisation(name: String): Option[String] = store.get(name)
  }
}
