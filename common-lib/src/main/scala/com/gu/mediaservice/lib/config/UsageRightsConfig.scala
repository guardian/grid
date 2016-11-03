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
    "Time & Life Pictures",
    "Time Life Pictures/Getty Images",
    "The Asahi Shimbun Premium",
    "The LIFE Images Collection",
    "The LIFE Picture Collection",
    "The LIFE Premium Collection",
    "Ullstein Bild Premium"
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
    "Action Images"
  )

  val suppliersCollectionExcl = Map(
    "Getty Images" -> payGettySourceList
  )
}
