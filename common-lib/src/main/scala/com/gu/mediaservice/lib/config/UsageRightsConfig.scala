package com.gu.mediaservice.lib.config

object UsageRightsConfig {

  val payGettySourceList = List(
    "Arnold Newman Collection",
    "360cities.net Editorial",
    "360cities.net RM",
    "age fotostock RM",
    "Alinari",
    "Arnold Newman Collection",
    "ASAblanca",
    // Note: Even though we have a deal directly with Barcroft, it
    // does not apply to images sourced through Getty. Silly, I know.
    "Barcroft Media",
    "Bloomberg",
    "Bob Thomas Sports Photography",
    "Carnegie Museum of Art",
    "Catwalking",
    "Contour",
    "Contour RA",
    "Corbis Premium Historical",
    "Reportage Archive",
    "Gamma-Legends",
    "Genuine Japan Editorial Stills",
    "Genuine Japan Creative Stills",
    "George Steinmetz",
    "Getty Images Sport Classic",
    "Iconic Images",
    "Iconica",
    "Icon Sport",
    "Kyodo News Stills",
    "Lichfield Studios Limited",
    "Masters",
    "Major League Baseball Platinum",
    "Mondadori Portfolio Premium",
    "National Geographic",
    "National Geographic RF",
    "National Geographic Creative",
    "National Geographic Magazines",
    "NBA Classic",
    "Neil Leifer Collection",
    "Papixs",
    "Paris Match Archive",
    "Paris Match Collection",
    "Pele 10",
    "Photonica",
    "Photonica World",
    "Popperfoto",
    "Premium Archive",
    "Reportage Archive",
    "SAMURAI JAPAN",
    "Sports Illustrated",
    "Sports Illustrated Classic",
    "Sygma Premium",
    "Terry O'Neill",
    "The Asahi Shimbun",
    "The Asahi Shimbun Premium",
    "The LIFE Premium Collection",
    "ullstein bild Premium",
    "VII Premium",
    "Vision Media"
  )

  val freeSuppliers = List(
    "AAP",
    "Alamy",
    "Allstar Picture Library",
    "AP",
    "Barcroft Media",
    "EPA",
    "Getty Images",
    "PA",
    "Reuters",
    "Rex Features",
    "Ronald Grant Archive",
    "Action Images",
    "Action Images via Reuters"
  )

  val suppliersCollectionExcl = Map(
    "Getty Images" -> payGettySourceList
  )
}
