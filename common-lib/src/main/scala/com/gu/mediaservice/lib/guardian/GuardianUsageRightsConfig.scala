package com.gu.mediaservice.lib.guardian

import com.gu.mediaservice.lib.config.{PublicationPhotographers, UsageRightsConfigProvider}

object GuardianUsageRightsConfig extends UsageRightsConfigProvider {
  private val ObserverPublication = "The Observer"
  private val GuardianPublication = "The Guardian"

  val externalStaffPhotographers: List[PublicationPhotographers] = List(
    PublicationPhotographers(GuardianPublication, List(
      "Ben Doherty",
      "Bill Code",
      "Calla Wahlquist",
      "David Sillitoe",
      "Graham Turner",
      "Helen Davidson",
      "Jill Mead",
      //"Jonny Weeks", (Commented out as Jonny's photo's aren't always as Staff.)
      "Joshua Robertson",
      "Rachel Vere",
      "Roger Tooth",
      "Sean Smith",
      "Melissa Davey",
      "Michael Safi",
      "Michael Slezak",
      "Sean Smith",
      "Carly Earl",
      // Past
      "Dan Chung",
      "Denis Thorpe",
      "Don McPhee",
      "Frank Baron",
      "Frank Martin",
      "Garry Weaser",
      "Graham Finlayson",
      "Martin Argles",
      "Peter Johns",
      "Robert Smithies",
      "Tom Stuttard",
      "Tricia De Courcy Ling",
      "Walter Doughty",
      "Eric Wadsworth",
    )),
    PublicationPhotographers(ObserverPublication, List(
      "David Newell Smith",
      "Tony McGrath",
      "Catherine Shaw",
      "John Reardon",
      "Sean Gibson"
    ))
  )

  // these are people who aren't photographers by trade, but have taken photographs for us.
  // This is mainly used so when we ingest photos from Picdar, we make sure we categorise
  // them correctly.
  // TODO: Think about removin these once Picdar is dead.
  val internalStaffPhotographers = List(
    PublicationPhotographers(GuardianPublication, List(
      "E Hamilton West",
      "Harriet St Johnston",
      "Lorna Roach",
      "Rachel Vere",
      "Ken Saunders"
    ))
  )

  val contractedPhotographers = List(
    PublicationPhotographers(GuardianPublication, List(
      "Alicia Canter",
      "Antonio Olmos",
      "Christopher Thomond",
      "David Levene",
      "Eamonn McCabe",
      "Graeme Robertson",
      "Johanna Parkin",
      "Linda Nylind",
      "Louise Hagger",
      "Martin Godwin",
      "Mike Bowers",
      "Murdo MacLeod",
      "Sarah Lee",
      "Tom Jenkins",
      "Tristram Kenton",
      "Jill Mead",
    )),
    PublicationPhotographers(ObserverPublication, List(
      "Andy Hall",
      "Antonio Olmos",
      "Gary Calton",
      "Jane Bown",
      "Jonathan Lovekin",
      "Karen Robinson",
      "Katherine Anne Rose",
      "Richard Saker",
      "Sophia Evans",
      "Suki Dhanda"
    ))
  )

  val staffIllustrators = List(
    "Guardian Design"
  )

  val contractIllustrators = List(
    PublicationPhotographers(GuardianPublication, List(
      "Ben Lamb",
      "Andrzej Krauze",
      "David Squires",
      "First Dog on the Moon",
      "Harry Venning",
      "Martin Rowson",
      "Matt Kenyon",
      "Matthew Blease",
      "Nicola Jennings",
      "Rosalind Asquith",
      "Steve Bell",
      "Steven Appleby",
      "Ben Jennings",
    )),
    PublicationPhotographers(ObserverPublication, List(
      "Chris Riddell",
      "David Foldvari",
      "David Simonds",
    ))
  )

  val creativeCommonsLicense = List(
    "CC BY-4.0", "CC BY-SA-4.0", "CC BY-ND-4.0"
  )

}
