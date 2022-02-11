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
    )),
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

  /* These are currently hardcoded */
  val payGettySourceList = List(
    "360cities.net Editorial",
    "360cities.net RM",
    "Action Plus",
    "Arnold Newman Collection",
    "age fotostock RM",
    "Alinari",
    "ASAblanca",
    "Bob Thomas Sports Photography",
    "Caiaimage",
    "Carnegie Museum of Art",
    "Catwalking",
    "Christian Science Monitor",
    "Conde Nast Collection Editorial",
    "Contour",
    "Contour RA",
    "Corbis Premium Historical",
    "Dorling Kindersley",
    "Editorial Specials",
    "Gamma-Legends",
    "Genuine Japan Editorial Stills",
    "Genuine Japan Creative Stills",
    "George Steinmetz",
    "Getty Images Sport Classic",
    "Hero Images",
    "Iconic Images",
    "Iconica",
    "Icon Sport",
    "Kyodo News Stills",
    "Lichfield Studios Limited",
    "Lonely Planet Images",
    "Lonely Planet RF",
    "LOOK",
    "Masters",
    "Major League Baseball Platinum",
    "Moment Select",
    "Mondadori Portfolio Premium",
    "National Geographic",
    "National Geographic RF",
    "National Geographic Creative",
    "National Geographic Magazines",
    "NBA Classic",
    "Neil Leifer Collection",
    "Newspix",
    "PA Images",
    "Papixs",
    "Paris Match Archive",
    "Paris Match Collection",
    "Pele 10",
    "Photonica",
    "Photonica World",
    "Popperfoto",
    "Popperfoto Creative",
    "Premium Archive",
    "Reportage Archive",
    "SAMURAI JAPAN",
    "Science Photo Library RM",
    "SNS Group",
    "Sports Illustrated",
    "Sports Illustrated Classic",
    "Sportsfile",
    "Sygma Premium",
    "Terry O'Neill",
    "The Asahi Shimbun Premium",
    "The LIFE Images Collection",
    "The LIFE Picture Collection",
    "The LIFE Premium Collection",
    "ullstein bild Premium",
    "Ulrich Baumgarten",
    "Universal Images Group",
    "VII Premium",
    "Vision Media",
    "VisitBritain RM",
    "Xinhua News Agency"
  )

  val freeSuppliers = List(
    "AAP",
    "Alamy",
    "Allstar Picture Library",
    "AP",
    "EPA",
    "Getty Images",
    "PA",
    "Reuters",
    "Rex Features",
    "Ronald Grant Archive",
    "Action Images",
    "Action Images/Reuters"
  )

  val suppliersCollectionExcl = Map(
    "Getty Images" -> payGettySourceList
  )

}
