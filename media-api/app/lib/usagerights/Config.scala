package lib.usagerights

import com.gu.mediaservice.model._

object Config {

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

  val categoryCosts: Map[UsageRightsCategory, Cost] = Map(
    Handout    -> Free,
    Screengrab -> Free,
    PrImage    -> Conditional
  )

  def getCategoriesOfCost(cost: Cost): List[UsageRightsCategory] =
    categoryCosts.filter(_._2 == cost).keys.toList
}


object DeprecatedConfig {

  // TODO: Review these with RCS et al
  val freeCreditList = List(
    "AAP",
    "AAPIMAGE",
    "AFP",
    "ANSA",
    "AP",
    "AP POOL",
    "Action Images",
    "Alamy",
    "Allsport",
    "Allstar Picture Library",
    "Associated Press",
    "BBC",
    "BFI",
    "Community Newswire",
    "Corbis",
    "dpa",
    "EPA",
    "FilmMagic",
    "Hulton Archive",
    "Hulton Getty",
    "IBL/REX",
    "Keystone",
    "NASA Earth Observatory",
    "NPA ROTA", "PA", "PA WIRE",
    "Pool",
    // Reuters
    "REUTERS",
    "Reuters",
    "RTRPIX",
    "USA Today Sports", // via Reuters too
    // REX
    "Rex Features",
    "Ronald Grant Archive",
    "THE RONALD GRANT ARCHIVE",
    "RONALD GRANT",
    "The Art Archive",
    "WireImage",
    // Getty
    "Getty Images",
    "AFP/Getty Images",
    "Bloomberg via Getty Images",
    "Fairfax Media via Getty Images",
    // FIXME: we've actually settled on "The Guardian" as canonical source.
    // There's now a MetadataCleaner to transform all to The Guardian canonical name.
    // We need to migrate all indexed content with "Guardian" to "The Guardian" before we can
    // retire Guardian from whitelist here.
    "Guardian", "The Guardian", "The Observer")

  val freeSourceList = List(
    "Corbis",
    "Rex Features",
    // Barcroft Media & sons
    "Barcroft Media",
    "Barcroft India",
    "Barcroft USA",
    "Barcroft Cars"
  )

}
