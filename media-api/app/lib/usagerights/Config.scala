package lib.usagerights


object DeprecatedConfig {
  val guardianCredits = List("The Guardian", "The Observer")

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
    "Fairfax Media via Getty Images") ++ guardianCredits

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
