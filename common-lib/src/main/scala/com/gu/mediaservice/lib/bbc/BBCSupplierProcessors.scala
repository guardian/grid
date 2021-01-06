package com.gu.mediaservice.lib.bbc

import com.gu.mediaservice.lib.bbc.components.{BBCDependenciesConfig, BBCImageProcessorsDependencies}
import com.gu.mediaservice.lib.cleanup.{AapParser, ActionImagesParser, AlamyParser, AllStarParser, ApParser, ComposeImageProcessors, CorbisParser, EpaParser, GettyCreditParser, GettyXmpParser, ImageProcessor, ImageProcessorResources, PaParser, PhotographerParser, ReutersParser, RexParser, RonaldGrantParser}
import com.gu.mediaservice.lib.config.{CommonConfig, KnownPhotographer}
import com.gu.mediaservice.lib.config.PhotographersList.caseInsensitiveLookup
import com.gu.mediaservice.model.{ContractPhotographer, Image, Photographer, StaffPhotographer}
import play.api.Configuration

/*
BBC Supplier processor.
In order to use it, you will have to update application.conf
image.processors = [
  ...
  "com.gu.mediaservice.lib.bbc.BBCSupplierProcessors$",
  "com.gu.mediaservice.lib.bbc.BBCPhotographerParser"
  ...
]
*/

object BBCSupplierProcessors extends ComposeImageProcessors(
  GettyXmpParser,
  GettyCreditParser,
  AapParser,
  ActionImagesParser,
  AlamyParser,
  AllStarParser,
  ApParser,
  CorbisParser,
  EpaParser,
  PaParser,
  ReutersParser,
  RexParser,
  RonaldGrantParser
)

class BBCPhotographerParser(resources: ImageProcessorResources) extends ImageProcessor {

  import com.gu.mediaservice.lib.bbc.components.BBCMetadataConfig.companyPhotographersMap
  val config = BBCDependenciesConfig(resources)
  val metadataStore = BBCImageProcessorsDependencies.metadataStore(config)
  lazy val staffPhotographersBBC = metadataStore.get.staffPhotographers
  lazy val contractedPhotographersBBC = metadataStore.get.contractedPhotographersMap


  def getPhotographer(photographer: String): Option[Photographer] = {
    caseInsensitiveLookup(companyPhotographersMap(staffPhotographersBBC), photographer).map {
      case KnownPhotographer(name, publication) => StaffPhotographer(name, publication)
    }.orElse(caseInsensitiveLookup(companyPhotographersMap(contractedPhotographersBBC), photographer).map {
      case KnownPhotographer(name, publication) => ContractPhotographer(name, Some(publication))
    })
  }

  override def apply(image: Image): Image = {
    image.metadata.byline.flatMap { byline =>
      getPhotographer(byline).map{
        case p: StaffPhotographer => image.copy(
          usageRights = p,
          metadata    = image.metadata.copy(credit = Some(p.publication), byline = Some(p.photographer))
        )
        case p: ContractPhotographer => image.copy(
          usageRights = p,
          metadata    = image.metadata.copy(credit = p.publication, byline = Some(p.photographer))
        )
        case _ => image
      }
    }
  }.getOrElse(image)

  override def description: String = "BBC Supplier Processor"
}


