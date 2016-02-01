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
  val Politics = Value("politics")
  val Religion = Value("religion")
  val Science = Value("science")
  val Social = Value("social")
  val Sport = Value("sport")
  val War = Value("war")
  val Weather = Value("weather")
  val Unknown = Value("unknown")

  // These category codes are now deprecated but still populated
  def create(category: String) = category match {
    // ANPA-1312 Codes: https://en.wikipedia.org/wiki/ANPA-1312
    case "F" => Finance
    case "L" => Lifestyle
    case "E" => Arts
    case "S" => Sport
    case "O" => Weather
    case "P" => Politics

    // See: https://www.iptc.org/std/photometadata/documentation/GenericGuidelines/index.htm#!Documents/guidelineformappingcategorycodestosubjectnewscodes.htm
    case "ACE" => Arts
    case "CLJ" => Crime
    case "DIS" => Disaster
    case "FIN" => Finance
    case "EDU" => Education
    case "EVN" => Environment
    case "HTH" => Health
    case "HUM" => Human
    case "LAB" => Labour
    case "LIF" => Lifestyle
    case "POL" => Politics
    case "REL" => Religion
    case "SCI" => Science
    case "SOI" => Social
    case "SPO" => Sport
    case "WAR" => War
    case "WEA" => Weather
    case _ => Unknown
  }
}
