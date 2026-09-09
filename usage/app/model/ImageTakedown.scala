package model

import cache.{ImageDecacheResult, ImageServices}
import com.gu.mediaservice.GridClient
import com.gu.mediaservice.lib.auth.Authentication
import org.joda.time.DateTime

import java.net.URI
import scala.concurrent.Future


case class Step(id: String, name: String, status: StepStatus)
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
                          urlsToPurge: List[URI]
                        ) {
  val jobs = List(cropDeletion, usageDeletion, gridDeletion, fastlyPurge)

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
      cropDeletion = Step("crop-deletion", "Crop Deletion", Pending),
      usageDeletion = Step("usage-deletion", "Usage Deletion", Pending),
      gridDeletion = Step("grid-deletion", "Grid Deletion", Pending),
      fastlyPurge = Step("fastly-purge", "Fastly Purge", Pending),
      urlsToPurge = cropUrls
    )
  }
}

class TakedownRun(gridClient: GridClient, auth: Authentication, imageServices: ImageServices, takedownStore: TakedownStore)(implicit val ec: scala.concurrent.ExecutionContext) {


  def retry(imageId: String, stepId: String) = {
    stepId match {
      case "crop-deletion" => runCropDelete(imageId)
      case "usage-deletion" => runUsagesDelete(imageId)
      case "grid-deletion" => runDeleteImage(imageId)
      case "fastly-purge" => takedownStore.get(imageId).map(runFastlyPurge).getOrElse(Future.successful(()))
    }
  }
  def runCropDelete(imageId: String) = {
    takedownStore.updateTakedown(imageId, i => i.copy(cropDeletion = i.cropDeletion.copy(status = InProgress)))
    Thread.sleep(2000)
    for {
      cropsRes <- gridClient.deleteCrops(imageId, auth.innerServiceCall)
    } yield {
      takedownStore.updateTakedown(imageId, i => i.copy(cropDeletion = if (cropsRes) i.cropDeletion.copy(status = Completed) else i.cropDeletion.copy(status = Failed)))
    }
  }

  def runUsagesDelete(imageId: String) = {
    takedownStore.updateTakedown(imageId, i => i.copy(usageDeletion = i.usageDeletion.copy(status = InProgress)))
    Thread.sleep(2000)
    for {
      usagesRes <- gridClient.deleteUsages(imageId, auth.innerServiceCall)
    } yield {
      takedownStore.updateTakedown(imageId, i => i.copy(usageDeletion = if (usagesRes) i.usageDeletion.copy(status = Completed) else i.usageDeletion.copy(status = Failed)))
    }
  }

  def runDeleteImage(imageId: String) = {
    takedownStore.updateTakedown(imageId, i => i.copy(gridDeletion = i.gridDeletion.copy(status = InProgress)))
    Thread.sleep(2000)
    for {
      gridRes <- gridClient.deleteImage(imageId, auth.innerServiceCall)
    } yield {
      takedownStore.updateTakedown(imageId, i => i.copy(gridDeletion = if (gridRes) i.gridDeletion.copy(status = Completed) else i.gridDeletion.copy(status = Failed)))
    }
  }

  def runFastlyPurge(imageTakedown: ImageTakedown) = {
    val imageId = imageTakedown.imageId
    takedownStore.updateTakedown(imageId, i => i.copy(fastlyPurge = i.fastlyPurge.copy(status = InProgress)))
    Thread.sleep(2000)
    for {
      _ <- Future.sequence(imageTakedown.urlsToPurge.map(c => imageServices.clearFastly(c)))
      availabilityResults <- Future.sequence(imageTakedown.urlsToPurge.map(c => imageServices.validateDecache(c)))
      imageDecacheResult = ImageDecacheResult(availabilityResults)
      _ = takedownStore.updateTakedown(imageId, i => i.copy(fastlyPurge = if(imageDecacheResult.allUrlsCleared) i.fastlyPurge.copy(status = Completed) else i.fastlyPurge.copy(status = Failed)))
    } yield {
      ()
    }
  }

  def run(imageTakedown: ImageTakedown) = {
    val imageId = imageTakedown.imageId
    takedownStore.updateTakedown(imageId, i => i.copy(cropDeletion = i.cropDeletion.copy(status = InProgress)))
    for {
      _ <- runCropDelete(imageId)
      _ <- runUsagesDelete(imageId)
      _ <- runDeleteImage(imageId)
      _ <- runFastlyPurge(imageTakedown)
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
