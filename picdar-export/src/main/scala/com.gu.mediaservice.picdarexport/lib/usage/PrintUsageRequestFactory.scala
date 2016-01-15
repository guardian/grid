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
          publicationCode = "XXX",
          publicationName = record.publicationName,
          layoutId = 0L,
          edition = record.edition,
          size = PrintImageSize(0,0),
          orderedBy = s"${record.notes.getOrElse("Unknown")} (Picdar)",
          sectionCode = record.sectionName
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
