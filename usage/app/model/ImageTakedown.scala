package model

import cache.{ImageDecacheResult, ImageServices}
import com.gu.mediaservice.GridClient
import com.gu.mediaservice.lib.auth.Authentication
import org.joda.time.DateTime

import java.net.URI
import scala.concurrent.Future


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

object ImageTakedown  {
  def apply(imageId: String, cropUrls: List[URI]): ImageTakedown = {
    ImageTakedown(
      imageId = imageId,
      requestedBy = "user",
      requestedAt = DateTime.now(),
      cropDeletion = Step("Crop Deletion", Pending),
      usageDeletion = Step("Usage Deletion", Pending),
      gridDeletion = Step("Grid Deletion", Pending),
      fastlyPurge = Step("Fastly Purge", Pending),
      availabilityCheck = Step("Checking Fastly", Pending),
      urlsToPurge = cropUrls
    )
  }
}

class TakedownRun(gridClient: GridClient, auth: Authentication, imageServices: ImageServices, takedownStore: TakedownStore)(implicit val ec: scala.concurrent.ExecutionContext) {
  def run(imageTakedown: ImageTakedown) = {
    val imageId = imageTakedown.imageId
    takedownStore.updateTakedown(imageId, i => i.copy(cropDeletion = i.cropDeletion.copy(status = InProgress)))
    for {
      cropsRes <- gridClient.deleteCrops(imageId, auth.innerServiceCall)
      _ = takedownStore.updateTakedown(imageId, i => i.copy(cropDeletion = if (cropsRes) i.cropDeletion.copy(status = Completed) else i.cropDeletion.copy(status = Failed)))
      _ = Thread.sleep(2000)
      _ = takedownStore.updateTakedown(imageId, i => i.copy(usageDeletion = i.usageDeletion.copy(status = InProgress)))
      usagesRes <- gridClient.deleteUsages(imageId, auth.innerServiceCall)
      _ = takedownStore.updateTakedown(imageId, i => i.copy(usageDeletion = if (usagesRes) i.usageDeletion.copy(status = Completed) else i.usageDeletion.copy(status = Failed)))
      _ = Thread.sleep(2000)
      _ = takedownStore.updateTakedown(imageId, i => i.copy(gridDeletion = i.gridDeletion.copy(status = InProgress)))
      gridRes <- gridClient.deleteImage(imageId, auth.innerServiceCall)
      _ = takedownStore.updateTakedown(imageId, i => i.copy(gridDeletion = if (gridRes) i.gridDeletion.copy(status = Completed) else i.gridDeletion.copy(status = Failed)))
      _ = Thread.sleep(2000)
      _ = takedownStore.updateTakedown(imageId, i => i.copy(fastlyPurge = i.fastlyPurge.copy(status = InProgress)))
      _  <- Future.sequence(imageTakedown.urlsToPurge.map(c => imageServices.clearFastly(c)))
      _ = takedownStore.updateTakedown(imageId, i => i.copy(fastlyPurge = i.fastlyPurge.copy(status = Completed)))
      _ = Thread.sleep(2000)
      _ = takedownStore.updateTakedown(imageId, i => i.copy(availabilityCheck = i.availabilityCheck.copy(status = InProgress)))
      availabilityResults <- Future.sequence(imageTakedown.urlsToPurge.map(c => imageServices.validateDecache(c)))
      _ = Thread.sleep(2000)
      imageDecacheResult = ImageDecacheResult(availabilityResults)
      _ = takedownStore.updateTakedown(imageId, i => i.copy(availabilityCheck = if(imageDecacheResult.allUrlsCleared) i.availabilityCheck.copy(status = Completed) else i.availabilityCheck.copy(status = Failed)))
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

  def add(imageTakedown: ImageTakedown) = {
    this.takedowns = this.takedowns + (imageTakedown.imageId -> imageTakedown)
  }

  def get(imageId: String) = {
    takedowns.get(imageId)
  }
}
