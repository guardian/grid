package model

import com.gu.mediaservice.GridClient
import com.gu.mediaservice.lib.auth.Authentication
import org.joda.time.DateTime

import java.net.URI


case class Step(name: String, status: StepStatus)
sealed trait StepStatus
case object Pending extends StepStatus
case object InProgress extends StepStatus
case object Completed extends StepStatus
case object Failed extends StepStatus

case class ImageTakedown(
                          imageId: String,
                          requestedBy: String,
                          requestedAt: DateTime,
                          cropDeletion: Step,
                          usageDeletion: Step,
                          gridDeletion: Step,
                          fastlyPurge: Step,
                          availabilityCheck: Step,
                          urlsToPurge: List[URI]
                        ) {
  val jobs = List(cropDeletion, usageDeletion, gridDeletion, fastlyPurge, availabilityCheck)

  val status = if( jobs.forall(_.status == Completed)) {
    "Completed"
  } else if (jobs.exists(_.status == Failed)) {
    "A step has failed"
  } else if (jobs.exists(_.status == InProgress)) {
    "In Progress"
  } else {
    "Waiting to start"
  }

}

class TakedownRun(gridClient: GridClient, auth: Authentication, takedownStore: TakedownStore)(implicit val ec: scala.concurrent.ExecutionContext) {
  def run(imageId: String) = {
    takedownStore.updateTakedown(imageId, i => i.copy(cropDeletion = i.cropDeletion.copy(status = InProgress)))
    for {
      cropsRes <- gridClient.deleteCrops(imageId, auth.innerServiceCall)
      _ = takedownStore.updateTakedown(imageId, i => i.copy(cropDeletion = if (cropsRes) i.cropDeletion.copy(status = Completed) else i.cropDeletion.copy(status = Failed)))
    } yield {
      ()
    }
  }
}

case class TakedownStore(
                         var takedowns: Map[String, ImageTakedown] = Map.empty
                       ) {
  def updateTakedown(imageId: String, updateFn: ImageTakedown => ImageTakedown): Unit = {
    val updatedTakedowns = takedowns.get(imageId) match {
      case Some(takedown) =>
        val updatedTakedown = updateFn(takedown)
        takedowns + (imageId -> updatedTakedown)
      case None =>
        takedowns
    }
    this.takedowns = updatedTakedowns
  }

  def add(imageId: String, cropUrls: List[URI]) = {
    val newTakedown = ImageTakedown(imageId, "user", DateTime.now(), Step("Crop Deletion",  Pending), Step("Usage Deletion", Pending), Step("Grid Deletion", Pending), Step("Fastly Purge", Pending), Step("Checking Fastly", Pending), cropUrls)
    this.takedowns = this.takedowns + (imageId -> newTakedown)
  }

  def get(imageId: String) = {
    takedowns.get(imageId)
  }
}
