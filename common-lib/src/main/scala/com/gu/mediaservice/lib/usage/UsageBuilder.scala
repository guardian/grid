package com.gu.mediaservice.lib.usage

import com.gu.mediaservice.model.usage._
import org.joda.time.DateTime

object UsageBuilder {

  def build(usage: MediaUsage) = Usage(
    buildId(usage),
    buildUsageReference(usage),
    usage.usageType,
    usage.mediaType,
    buildStatusString(usage),
    usage.dateAdded,
    usage.dateRemoved,
    usage.lastModified,
    usage.printUsageMetadata,
    usage.digitalUsageMetadata,
    usage.syndicationUsageMetadata,
    usage.frontUsageMetadata,
    usage.downloadUsageMetadata,
    usage.integrationUsageMetadata
  )

  private def buildStatusString(usage: MediaUsage): UsageStatus = if (usage.isRemoved) RemovedUsageStatus else usage.status

  private def buildId(usage: MediaUsage): String = {
    UsageTableFullKey.build(usage).toString
  }

  private def buildUsageReference(usage: MediaUsage): List[UsageReference] = {

    println("-------")
    println("build usage reference has been called")
    println("usage is: " + usage)
    println("-------------")
    println("usage type is: " + usage.usageType)
    println("----------")
    println("integration usage metadata is: " + usage.integrationUsageMetadata)

    usage.usageType match {
      case DigitalUsage => buildDigitalUsageReference(usage)
      case PrintUsage => buildPrintUsageReference(usage)
      case SyndicationUsage => buildSyndicationUsageReference(usage)
      case DownloadUsage => buildDownloadUsageReference(usage)
      case IntegrationUsage => buildIntegrationUsageReference(usage)
    }
  }

  private def buildPrintUsageReference(usage: MediaUsage):List[UsageReference] =
    usage.printUsageMetadata.map(metadata => {
      val title = List(
        new DateTime(metadata.issueDate).toString("YYYY-MM-dd"),
        metadata.publicationName,
        metadata.sectionName,
        s"Page ${metadata.pageNumber}"
      ).mkString(", ")

      List(UsageReference(InDesignUsageReference, None, Some(title)))

    }).getOrElse(List[UsageReference]())

  private def buildDigitalUsageReference(usage: MediaUsage): List[UsageReference] = {
    (usage.digitalUsageMetadata, usage.frontUsageMetadata) match {
      case (Some(metadata), None) => List(
        UsageReference(FrontendUsageReference, Some(metadata.webUrl), Some(metadata.webTitle))
      ) ++ metadata.composerUrl.map(url => UsageReference(ComposerUsageReference, Some(url)))
      case (None, Some(metadata)) => List(
        UsageReference(FrontUsageReference, None, name = Some(metadata.front))
      )
      case (_, _) => List[UsageReference]()
    }
  }

  private def buildSyndicationUsageReference(usage: MediaUsage): List[UsageReference] = usage.syndicationUsageMetadata.map (metadata => {
    List(
      UsageReference(
        SyndicationUsageReference, None, metadata.syndicatedBy.map(_ => s"${metadata.partnerName}, ${metadata.syndicatedBy.get}").orElse(Some(metadata.partnerName))
      )
    )
  }).getOrElse(
    List[UsageReference]()
  )

  private def buildDownloadUsageReference(usage: MediaUsage): List[UsageReference] = usage.downloadUsageMetadata.map (metadata => {
    println("---- made it to the download usage reference builder")
    List(
      UsageReference(
        DownloadUsageReference, None, Some(metadata.downloadedBy)
      )
    )
  }).getOrElse(
    List[UsageReference]()
  )

  private def buildIntegrationUsageReference(usage: MediaUsage): List[UsageReference] = usage.integrationUsageMetadata.map (metadata => {
    println("-----------Made it to the integration usage reference builder")
    val m  = List(
      UsageReference(
        IntegrationUsageReference, None, name = Some(metadata.integratedBy)
      )
    )
    println(s"-----buildIntegrationUsageReference LIST: ${m}")
    List(
      UsageReference(
        IntegrationUsageReference,None, name = Some(metadata.integratedBy)
      )
    )
  }).getOrElse(
    List[UsageReference]()
  )
}
