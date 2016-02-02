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
  val Politics = Value("politics")
  val Religion = Value("religion")
  val Science = Value("science")
  val Social = Value("social")
  val Sport = Value("sport")
  val War = Value("war")
  val Weather = Value("weather")
  val Unknown = Value("unknown")

  // These category codes are now deprecated but still populated
  def create(category: String): Option[Subject.Value] = category match {
    // ANPA-1312 Codes: https://en.wikipedia.org/wiki/ANPA-1312
    case "F" => Some(Finance)
    case "L" => Some(Lifestyle)
    case "E" => Some(Arts)
    case "S" => Some(Sport)
    case "O" => Some(Weather)
    case "P" => Some(Politics)

    // See: https://www.iptc.org/std/photometadata/documentation/GenericGuidelines/index.htm#!Documents/guidelineformappingcategorycodestosubjectnewscodes.htm
    case "ACE" => Some(Arts)
    case "CLJ" => Some(Crime)
    case "DIS" => Some(Disaster)
    case "FIN" => Some(Finance)
    case "EDU" => Some(Education)
    case "EVN" => Some(Environment)
    case "HTH" => Some(Health)
    case "HUM" => Some(Human)
    case "LAB" => Some(Labour)
    case "LIF" => Some(Lifestyle)
    case "POL" => Some(Politics)
    case "REL" => Some(Religion)
    case "SCI" => Some(Science)
    case "SOI" => Some(Social)
    case "SPO" => Some(Sport)
    case "WAR" => Some(War)
    case "WEA" => Some(Weather)

    // Added from an internally supplied list
    case "ANI" => Some(Nature)
    case "NAT" => Some(Nature)
    case "WLD" => Some(Nature)
    case "BIZ" => Some(Finance)
    case "MAX" => Some(Finance)
    case "ENT" => Some(Arts)
    case "CEL" => Some(Arts)
    case "ODD" => Some(Lifestyle)

    // Other vaues used in supplemental categories
    case "Entertainment" => Some(Arts)
    case "Fashion" => Some(Arts)
    case "Showbiz" => Some(Arts)

    case _ => None
  }
}
