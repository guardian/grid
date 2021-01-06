package com.gu.mediaservice.lib.bbc.components

import com.gu.mediaservice.lib.config.KnownPhotographer
import play.api.libs.json._

case class BBCMetadataConfig(
                           staffIllustrators: List[String],
                           creativeCommonsLicense: List[String],
                           externalStaffPhotographers: List[Company],
                           internalStaffPhotographers: List[Company],
                           contractedPhotographers: List[Company],
                           contractIllustrators: List[Company]) {

  val staffPhotographers: Map[String, List[String]] = BBCMetadataConfig.flattenCompanyListMap(
    internalStaffPhotographers ++ externalStaffPhotographers)

  val allPhotographers:  Map[String, List[String]] = BBCMetadataConfig.flattenCompanyListMap(
    internalStaffPhotographers ++ externalStaffPhotographers ++ contractedPhotographers)

  val contractedPhotographersMap: Map[String, List[String]] = BBCMetadataConfig.flattenCompanyListMap(contractedPhotographers)

}

case class Company(name: String, photographers: List[String])

object Company {
  implicit val companyClassFormats = Json.format[Company]
}

object BBCMetadataConfig {
  implicit val metadataConfigClassFormats = Json.format[BBCMetadataConfig]
  def companyPhotographersMap(companyPhotographers: Map[String, List[String]]): List[KnownPhotographer] = {
    companyPhotographers.flatMap { companyPhotographersItem =>
      val company = companyPhotographersItem._1
      val photographers = companyPhotographersItem._2

      photographers.map { photographer =>
        KnownPhotographer(photographer, company)
      }
    }.toList
  }

  def flattenCompanyList(companies: List[Company]): List[Company] = companies
    .groupBy(_.name)
    .map { case (group, companies) => Company(group, companies.flatMap(company => company.photographers)) }
    .toList

  def flattenCompanyListMap(companies: List[Company]) : Map[String, List[String]] = flattenCompanyList(companies)
    .map {company => company.name -> company.photographers}
    .toMap
}
