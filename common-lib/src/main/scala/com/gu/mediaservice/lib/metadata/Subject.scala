package com.gu.mediaservice.lib.metadata


object Subject extends Enumeration {
  type SupplierCategory = Value
  val Arts = Value("arts")
  val Crime = Value("crime")
  val Disaster = Value("disaster")
  val Finance = Value("finance")
  val Education = Value("education")
  val Environment = Value("environment")
  val Health = Value("health")
  val Human = Value("human")
  val Labour = Value("labour")
  val Lifestyle = Value("lifestyle")
  val Nature = Value("nature")
  val News = Value("news")
  val Politics = Value("politics")
  val Religion = Value("religion")
  val Science = Value("science")
  val Social = Value("social")
  val Sport = Value("sport")
  val War = Value("war")
  val Weather = Value("weather")

  // These category codes are now deprecated but still populated
  def create(category: String): Option[Subject.Value] = category.toLowerCase match {
    // ANPA-1312 Codes: https://en.wikipedia.org/wiki/ANPA-1312
    // http://www.eznews.com/help/ezsend/index.html?ANPAStandard
    case "f" => Some(Finance)
    case "l" => Some(Lifestyle)
    case "e" => Some(Arts)
    case "s" => Some(Sport)
    case "o" => Some(Weather)
    case "p" => Some(Politics)
    case "i" => Some(News)
    case "a" => Some(News)

    // See: https://www.iptc.org/std/photometadata/documentation/GenericGuidelines/index.htm#!Documents/guidelineformappingcategorycodestosubjectnewscodes.htm
    case "ace" => Some(Arts)
    case "clj" => Some(Crime)
    case "dis" => Some(Disaster)
    case "fin" => Some(Finance)
    case "edu" => Some(Education)
    case "evn" => Some(Environment)
    case "hth" => Some(Health)
    case "hum" => Some(Human)
    case "lab" => Some(Labour)
    case "lif" => Some(Lifestyle)
    case "pol" => Some(Politics)
    case "rel" => Some(Religion)
    case "sci" => Some(Science)
    case "soi" => Some(Social)
    case "spo" => Some(Sport)
    case "war" => Some(War)
    case "wea" => Some(Weather)

    // Added from an internally supplied list
    case "ani" => Some(Nature)
    case "nat" => Some(Nature)
    case "wld" => Some(Nature)
    case "biz" => Some(Finance)
    case "max" => Some(Finance)
    case "ent" => Some(Arts)
    case "cel" => Some(Arts)
    case "odd" => Some(Lifestyle)

    // Other vaues used in supplemental categories
    case "entertainment" => Some(Arts)
    case "fashion" => Some(Arts)
    case "showbiz" => Some(Arts)

    case _ => None
  }
}
