package lib

import java.net.URL

import com.gu.contentapi.client.model.v1.Content
import com.gu.mediaservice.model.{DigitalUsageMetadata, PrintImageSize, PrintUsageMetadata}
import org.joda.time.format.ISODateTimeFormat

import scala.util.Try

class UsageMetadataBuilder(config: UsageConfig) {

  def buildDigital(metadataMap: Map[String, Any]): Option[DigitalUsageMetadata] = {
    Try {
      DigitalUsageMetadata(
        metadataMap("webTitle").asInstanceOf[String],
        metadataMap("webUrl").asInstanceOf[String],
        metadataMap("sectionId").asInstanceOf[String],
        metadataMap.get("composerUrl").map(_.asInstanceOf[String])
      )
    }.toOption
  }

  def buildPrint(metadataMap: Map[String, Any]): Option[PrintUsageMetadata] = {
    type JStringNumMap = java.util.LinkedHashMap[String, java.math.BigDecimal]
    Try {
      PrintUsageMetadata(
        sectionName = metadataMap.apply("sectionName").asInstanceOf[String],
        issueDate = metadataMap.get("issueDate").map(_.asInstanceOf[String])
          .map(ISODateTimeFormat.dateTimeParser().parseDateTime).get,
        pageNumber = metadataMap.apply("pageNumber").asInstanceOf[java.math.BigDecimal].intValue,
        storyName = metadataMap.apply("storyName").asInstanceOf[String],
        publicationCode = metadataMap.apply("publicationCode").asInstanceOf[String],
        publicationName = metadataMap.apply("publicationName").asInstanceOf[String],
        layoutId = metadataMap.get("layoutId").map(_.asInstanceOf[java.math.BigDecimal].intValue),
        edition = metadataMap.get("edition").map(_.asInstanceOf[java.math.BigDecimal].intValue),
        size = metadataMap.get("size")
          .map(_.asInstanceOf[JStringNumMap])
          .map(m => PrintImageSize(m.get("x").intValue, m.get("y").intValue)),
        orderedBy = metadataMap.get("orderedBy").map(_.asInstanceOf[String]),
        sectionCode = metadataMap.apply("sectionCode").asInstanceOf[String],
        notes = metadataMap.get("notes").map(_.asInstanceOf[String]),
        source = metadataMap.get("source").map(_.asInstanceOf[String])
      )
    }.toOption
  }

  def build(content: Content): DigitalUsageMetadata = {
    DigitalUsageMetadata(
      content.webTitle,
      content.webUrl,
      content.sectionId.getOrElse("none"),
      composerUrl(content)
    )
  }

  def composerUrl(content: Content): Option[String] = content.fields
    .flatMap(_.internalComposerCode)
    .flatMap(composerId => {
      Try(new URL(s"${config.composerContentBaseUrl}/$composerId").toString).toOption
    })

}
