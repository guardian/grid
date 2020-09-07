package com.gu.mediaservice.lib.config

import com.gu.mediaservice.model.{ContractPhotographer, Photographer, StaffPhotographer}
import play.api.libs.json._

// NB: if you add fields to here please update setup.sh which creates an empty version for use in local dev
case class MetadataConfig(
  staffIllustrators: List[String],
  creativeCommonsLicense: List[String],
  externalStaffPhotographers: List[Company],
  internalStaffPhotographers: List[Company],
  contractedPhotographers: List[Company],
  contractIllustrators: List[Company]) {
  val staffPhotographers: List[Company] = MetadataConfig.flattenCompanyList(
    internalStaffPhotographers ++ externalStaffPhotographers)
  val allPhotographers: List[Company] = MetadataConfig.flattenCompanyList(
    internalStaffPhotographers ++ externalStaffPhotographers ++ contractedPhotographers)

  def caseInsensitiveLookup(store: List[Company], lookup: String) = {
    store.map {
      case Company(name, photographers) if photographers.map(_.toLowerCase) contains lookup.toLowerCase() => Some(lookup, name)
      case _ => None
    }.find(_.isDefined).flatten
  }

  def getPhotographer(photographer: String): Option[Photographer] = {
    caseInsensitiveLookup(staffPhotographers, photographer).map {
      case (name, pub) => StaffPhotographer(name, pub)
    }.orElse(caseInsensitiveLookup(contractedPhotographers, photographer).map {
      case (name, pub) => ContractPhotographer(name, Some(pub))
    })
  }
}

case class Company(name: String, photographers: List[String])

object Company {
  implicit val companyClassFormats = Json.format[Company]
}

object MetadataConfig {
  implicit val metadataConfigClassFormats = Json.format[MetadataConfig]

  def flattenCompanyList(companies: List[Company]): List[Company] = companies
    .groupBy(_.name)
    .map { case (group, companies) => Company(group, companies.flatMap(company => company.photographers)) }
    .toList

}

