package com.gu.mediaservice.lib.config

object UsageRightsConfig {

  val payGettySourceList = List(
    "Arnold Newman Collection",
    // Note: Even though we have a deal directly with Barcroft, it
    // does not apply to images sourced through Getty. Silly, I know.
    "Barcroft Media",
    "Catwalking",
    "Contour by Getty Images",
    "Contour Style",
    "Edit",
    "Ernst Haas",
    "Gamma-Legends",
    "Gamma-Rapho",
    "ICP",
    "Lichfield Studios Limited",
    "Major League Baseball Platinum",
    "Masters",
    "Mondadori Portfolio Premium",
    "NBA Classic",
    "Neil Leifer Collection",
    "Papixs",
    "Paris Match Archive",
    "Paris Match Collection",
    "Premium Archive",
    "Reportage by Getty Images",
    "Roger Viollet",
    "Sports Illustrated",
    "Sports Illustrated Classic",
    "Terry O'Neill",
    "The Asahi Shimbun Premium",
    "The LIFE Images Collection",
    "The LIFE Picture Collection",
    "The LIFE Premium Collection",
    "Ullstein Bild Premium"
  )

  // New rights model, will supersede `freeCreditList` soon
  val freeSuppliers = List(
    "AAP",
    "Action Images",
    "Alamy",
    "Allstar Picture Library",
    "AP",
    "Barcroft Media",
    "Corbis",
    "EPA",
    "Getty Images",
    "PA",
    "Reuters",
    "Rex Features",
    "Ronald Grant Archive"
  )

  val suppliersCollectionExcl = Map(
    "Getty Images" -> payGettySourceList
  )
}
