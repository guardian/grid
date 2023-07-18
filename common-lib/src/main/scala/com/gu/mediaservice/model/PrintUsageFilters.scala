package com.gu.mediaservice.model

import org.joda.time.DateTime

case class PrintUsageFilters(
  issueDate: DateTime,
  sectionCode: Option[String],
  pageNumber: Option[Int],
  edition: Option[Int]
)
