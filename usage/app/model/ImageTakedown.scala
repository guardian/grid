package model

import org.joda.time.DateTime

import java.net.URI

sealed trait StepStatus
case object Pending extends StepStatus
case object InProgress extends StepStatus
case object Completed extends StepStatus
case object Failed extends StepStatus

case class ImageTakedown(
                          imageId: String,
                          requestedBy: String,
                          requestedAt: DateTime,
                          cropDeletion: StepStatus,
                          usageDeletion: StepStatus,
                          gridDeletion: StepStatus,
                          fastlyPurge: StepStatus,
                          availabilityCheck: StepStatus,
                          urlsToPurge: List[URI]
                        ) {
  val status = "In Progress"
}
