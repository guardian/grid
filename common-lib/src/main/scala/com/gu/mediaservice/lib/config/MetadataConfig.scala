package com.gu.mediaservice.lib.config

object MetadataConfig {

  // TODO: Move this list into an admin-managed repository
  // Mapping of credit->byline for metadata cleanup
  val creditBylineMap = Map(
    "The Guardian" -> List(
      "Christopher Thomond",
      "Sean Smith",
      "David Levene",
      "David Sillitoe",
      "Eamonn Mccabe",
      "Felicity Cloake",
      "Frank Baron",
      "Graeme Robertson",
      "Graham Turner",
      "Linda Nylind",
      "Martin Argles",
      "Martin Godwin",
      "Mike Bowers",
      "Murdo Macleod",
      "Sarah Lee",
      "Tom Jenkins",
      "Tristram Kenton"
    ),
    "The Observer" -> List(
      "Andy Hall",
      "Antonio Olmos",
      "Catherine Shaw",
      "Gary Calton",
      "Karen Robinson",
      "Katherine Anne Rose",
      "Richard Saker",
      "Sophia Evans",
      "Suki Dhanda"
    )
  )
}
