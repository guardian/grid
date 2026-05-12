package com.gu.mediaservice.lib.usage

import com.gu.mediaservice.model.usage._
import org.joda.time.DateTime

import java.net.URI

object UsageBuilder {

  def build(usage: MediaUsage) = Usage(
    id = buildId(usage),
    references = buildUsageReference(usage),
    platform = usage.usageType,
    media = usage.mediaType,
    status = buildStatusString(usage),
    dateAdded = usage.dateAdded,
    dateRemoved = usage.dateRemoved,
    lastModified = usage.lastModified,
    printUsageMetadata = usage.printUsageMetadata,
    digitalUsageMetadata = usage.digitalUsageMetadata,
    syndicationUsageMetadata = usage.syndicationUsageMetadata,
    frontUsageMetadata = usage.frontUsageMetadata,
    downloadUsageMetadata = usage.downloadUsageMetadata,
    childUsageMetadata = usage.childUsageMetadata
  )

  private def buildStatusString(usage: MediaUsage): UsageStatus = if (usage.isRemoved) RemovedUsageStatus else usage.status

  private def buildId(usage: MediaUsage): String = {
    UsageTableFullKey.build(usage).toString
  }

  private def buildUsageReference(usage: MediaUsage): List[UsageReference] = {
    usage.usageType match {
      case DigitalUsage => buildDigitalUsageReference(usage)
      case PrintUsage => buildPrintUsageReference(usage)
      case SyndicationUsage => buildSyndicationUsageReference(usage)
      case DownloadUsage => buildDownloadUsageReference(usage)
      case DerivativeUsage => buildChildUsageReference(usage, GridUsageReference)
      case ReplacedUsage => buildChildUsageReference(usage, GridUsageReference)
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
    List(
      UsageReference(
        DownloadUsageReference, None, Some(metadata.downloadedBy)
      )
    )
  }).getOrElse(
    List[UsageReference]()
  )

  private def buildChildUsageReference(usage: MediaUsage, usageReferenceType: UsageReferenceType): List[UsageReference] = usage.childUsageMetadata.map (metadata => {
    List(
      UsageReference(
        `type` = usageReferenceType,
        uri = Some(new URI(metadata.childMediaId)), // should manifest as a relative link
        name = Some(metadata.childMediaId)
      )
    )
  }).getOrElse(
    List[UsageReference]()
  )
}
