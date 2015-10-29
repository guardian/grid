package com.gu.mediaservice.lib.config

object UsageRightsConfig {

  // Note: we filter exclusively on matching source, rather than combining credit=Getty and source=X
  // this is assumed to be good enough as it's unlikely other provider will use the same source.
  val payGettySourceList = List(
    // TODO: Remove once we are on the new UsageRights model
    // This is not excluded as we have a deal with Barcroft,
    // and there are only a tiny amount from Getty
    // "Barcroft Media",
    "Catwalking",
    "Contour by Getty Images",
    "Contour Style",
    "Edit",
    "Fashion Window",
    "Gamma-Legend",
    "Gamma-Rapho",
    "International Center of Photography",
    "Lichfield Archive",
    "MLB Major League Baseball Platinum",
    "Masters",
    "NBA Classic",
    "Neil Leifer Collection",
    "Papixs",
    "Paris Match Archive",
    "Paris Match Collection",
    "Premium Archive",
    "Reportage by Getty Images",
    "Sports Illustrated",
    "Sports Illustrated Classic",
    "Terry O'Neill",
    "The Asahi Shimbun Premium Archive",
    "The LIFE Images Collection",
    // On the Getty list this is called "The LIFE picture collection Editorial"
    // whereas in their metadata they use the below
    "The LIFE Picture Collection",
    "The LIFE Premium Collection"
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
