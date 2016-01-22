package com.gu.mediaservice.picdarexport.lib.usage

import com.gu.mediaservice.picdarexport.model.PicdarUsageRecord
import com.gu.mediaservice.model.{PrintUsageRequest, PrintUsageRecord, PrintUsageMetadata, PrintImageSize}

import lib.MD5

import org.joda.time.DateTime


object PrintUsageRequestFactory {
  def create(picdarUsageRecords: List[PicdarUsageRecord], mediaId: String): Option[PrintUsageRequest] = {
    val printUsageRecords = picdarUsageRecords.zipWithIndex.map {
      case (record: PicdarUsageRecord, i: Int) => {
        val metadata = PrintUsageMetadata(
          sectionName = record.sectionName,
          issueDate = record.publicationDate,
          pageNumber = record.page,
          storyName = record.productionName,
          publicationCode = record.publicationName match {
            case "The Guardian" => "gdn"
            case "The Observer" => "obs"
            case _ => "xxx"
          },
          publicationName = record.publicationName,
          edition = record.edition,
          sectionCode = record.sectionName,
          notes = record.notes,
          source = Some("picdar")
        )

        PrintUsageRecord(
          dateAdded = record.createdDate,
          mediaId = mediaId,
          printUsageMetadata = metadata,
          containerId = MD5.hash(s"${record.productionName}_${mediaId}"),
          usageId = MD5.hash(s"${record.productionName}_${mediaId}_${i}"),
          usageStatus = record.status
        )
      }
    }

    printUsageRecords match {
      case Nil => None
      case _ => Some(PrintUsageRequest(printUsageRecords))
    }
  }
}
