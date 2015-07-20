package com.gu.mediaservice.lib.config

object UsageRightsConfig {

  // Note: we filter exclusively on matching source, rather than combining credit=Getty and source=X
  // this is assumed to be good enough as it's unlikely other provider will use the same source.
  val payGettySourceList = List(
    "ASAblanca",
    "Anadolu",
    "BBC News & Current Affairs",
    // TODO: put back in once we can filter on both
    // supplier/collection, since we have a direct deal with
    // Barcroft. Also, should it be "Barcroft Media"?
    // "Barcroft",
    "Blom UK",
    "Boston Globe",
    "British Athletics",
    "Bundesliga Collection",
    "Caiaimage",
    "Carnegie Museum Art",
    "Catwalking",
    "Champions Hockey League",
    "City-Press",
    "Contour Style",
    "Contour",
    "Country Music Hall of Fame and Museum",
    "Cricket Australia",
    "Denver Post",
    "Edit",
    "Fox Image Collection",
    "French Select",
    "Frontzone Sport",
    "GC Images",
    "Gallo Images Editorial",
    "Gamma Legends",
    "Gamma Rapho",
    "German Select",
    "Getty Images Portrait",
    "Golden Boy Promotions",
    "Her Og Nu",
    "Hero Images",
    "Hulton Royals Collection",
    "IAAF World Athletics",
    "ICC",
    "Imperial War Museums",
    "Interact Images",
    "International Center of Photography",
    "Kommersant",
    "Lichfield Archive",
    "LightRocket",
    "MLB Platinum",
    "Mark Leech Sports Photography",
    "Masters",
    "Moment Editorial",
    "Moment Mobile Editorial",
    "Mondadori Portfolio",
    "NBA Classic",
    "NBCUniversal",
    "NHLPA - Be A Player",
    "Neil Leifer Collection",
    "PB Archive",
    "PGA of America",
    "Papixs",
    "Paris Match Archive",
    "Paris Match Collection",
    "Photothek",
    "Portland Press Herald",
    "Premium Archive",
    "Premium Ent",
    "Rainer Schlegelmilch",
    "Replay Photos",
    "Reportage by Getty Images",
    "Ron Galella Collection",
    "SAMURAI JAPAN",
    "Sports Illustrated Classic",
    "Sports Illustrated",
    "Terry O’Neill",
    "The Asahi Shimbun Premium",
    "The Conlon Collection",
    "The IRB Collection",
    "The LIFE Image Collection",
    "The LIFE Picture Collection",
    "The LIFE Premium Collection",
    "The Ring Magazine",
    "Toronto Star",
    "UEFA.com",
    "UK Press",
    "Ulrich Baumgarten",
    "Universal Images",
    "World Kabbadi League",
    "ullstein bild"
  )

  // New rights model, will supersede `freeCreditList` soon
  val freeSuppliers = List(
    "AAP",
    "Action Images",
    "Alamy",
    "AP",
    "Barcroft Media",
    "Corbis",
    "EPA",
    "Getty Images",
    "PA",
    "Reuters",
    "Rex Features"
  )

  val suppliersCollectionExcl = Map(
    "Getty Images" -> payGettySourceList
  )

}
