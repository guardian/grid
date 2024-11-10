package controllers

import org.apache.pekko.Done
import org.apache.pekko.stream.Materializer
import com.amazonaws.services.cloudwatch.model.Dimension
import com.amazonaws.services.s3.AmazonS3
import com.amazonaws.services.sqs.model.{Message => SQSMessage}
import com.amazonaws.util.IOUtils
import com.drew.imaging.ImageProcessingException
import com.gu.mediaservice.GridClient
import com.gu.mediaservice.lib.ImageIngestOperations.fileKeyFromId
import com.gu.mediaservice.lib.argo.ArgoHelpers
import com.gu.mediaservice.lib.argo.model.Link
import com.gu.mediaservice.lib.auth.Authentication.OnBehalfOfPrincipal
import com.gu.mediaservice.lib.auth._
import com.gu.mediaservice.lib.aws.{S3Ops, SimpleSqsMessageConsumer, SqsHelpers}
import com.gu.mediaservice.lib.config.InstanceForRequest
import com.gu.mediaservice.lib.formatting.printDateTime
import com.gu.mediaservice.lib.logging.{FALLBACK, LogMarker, MarkerMap}
import com.gu.mediaservice.lib.play.RequestLoggingFilter
import com.gu.mediaservice.lib.{DateTimeUtils, ImageIngestOperations}
import com.gu.mediaservice.model.{Instance, UnsupportedMimeTypeException, UploadInfo}
import lib.FailureResponse.Response
import lib._
import lib.imaging.{MimeTypeDetection, NoSuchImageExistsInS3, UserImageLoaderException}
import lib.storage.ImageLoaderStore
import model.upload.UploadRequest
import model.{Projector, QuarantineUploader, S3FileExtractedMetadata, S3IngestObject, StatusType, UploadStatus, UploadStatusRecord, UploadStatusUri, Uploader}
import org.scanamo.{ConditionNotMet, ScanamoError}
import play.api.data.Form
import play.api.data.Forms._
import play.api.libs.json.Json
import play.api.mvc._

import java.io.{File, FileOutputStream}
import java.net.URI
import java.time.Instant
import scala.concurrent.{ExecutionContext, Future}
import scala.util.control.NonFatal
import scala.util.{Failure, Success, Try}

class ImageLoaderController(auth: Authentication,
                            downloader: Downloader,
                            store: ImageLoaderStore,
                            maybeIngestQueue: Option[SimpleSqsMessageConsumer],
                            uploadStatusTable: UploadStatusTable,
                            notifications: Notifications,
                            config: ImageLoaderConfig,
                            uploader: Uploader,
                            quarantineUploader: Option[QuarantineUploader],
                            projector: Projector,
                            override val controllerComponents: ControllerComponents,
                            gridClient: GridClient,
                            authorisation: Authorisation,
                            metrics: ImageLoaderMetrics)
                           (implicit val ec: ExecutionContext, materializer: Materializer)
  extends BaseController with ArgoHelpers with SqsHelpers with InstanceForRequest {

  private val AuthenticatedAndAuthorised = auth andThen authorisation.CommonActionFilters.authorisedForUpload

  //TODO first example of a non user facing message which needs to be made instance aware!
  val maybeIngestQueueAndProcessor: Option[(SimpleSqsMessageConsumer, Future[Done])] = None
  /*
  val maybeIngestQueueAndProcessor: Option[(SimpleSqsMessageConsumer, Future[Done])] = maybeIngestQueue.map { ingestQueue =>
    val processor = Source.repeat(())
      .mapAsyncUnordered(parallelism=1)(_ => {
        ingestQueue.getNextMessage(attrApproximateReceiveCount) match {
          case None =>
            Future.successful(logger.debug(s"No message at ${DateTimeUtils.now()}"))
          case Some(sqsMessage) =>
            val logMarker: LogMarker = MarkerMap(
              "requestType" -> "handleMessageFromIngestBucket",
              "requestId" -> sqsMessage.getMessageId,
            )
            handleMessageFromIngestBucket(sqsMessage)(logMarker)
              .recover {
                case _: S3FileDoesNotExistException => ()
              }
              .map { _ =>
                logger.info(logMarker, "Deleting message")
                ingestQueue.deleteMessage(sqsMessage)
              }
              .recover {
                case t: Throwable =>
                  metrics.failedIngestsFromQueue.increment()
                  logger.error(logMarker, s"Failed to process message", t)
              }
        }
      })
      .run()

    processor.onComplete {
      case Failure(exception) => throw exception
      case Success(_) => throw new Exception("Ingest queue processor stream completed, when it should never complete")
    }

    (ingestQueue, processor)
  }
  */

  private def indexResponse(instance: Instance): Result = {
    val indexData = Map("description" -> "This is the Loader Service")
    val indexLinks = List(
      Link("prepare", s"${config.rootUri(instance)}/prepare"),
      Link("uploadStatus", s"${config.rootUri(instance)}/uploadStatus/{id}"),
      Link("uploadStatuses", s"${config.rootUri(instance)}/uploadStatuses"),
      Link("load", s"${config.rootUri(instance)}/images{?uploadedBy,identifiers,uploadTime,filename}"),
      Link("import", s"${config.rootUri(instance)}/imports{?uri,uploadedBy,identifiers,uploadTime,filename}")
    )
    respond(indexData, indexLinks)
  }

  def index: Action[AnyContent] = AuthenticatedAndAuthorised { request =>
    indexResponse(instanceOf(request))
  }

  private def quarantineOrStoreImage(uploadRequest: UploadRequest)(implicit logMarker: LogMarker, instance: Instance) = {
    quarantineUploader.map(_.quarantineFile(uploadRequest)(instance)).getOrElse(for { uploadStatusUri <- uploader.storeFile(uploadRequest)} yield{uploadStatusUri.toJsObject})
  }

  private def handleMessageFromIngestBucket(sqsMessage:SQSMessage)(basicLogMarker: LogMarker, request: Request[AnyContent]): Future[Unit] = Future[Future[Unit]]{
    implicit val instance = ???  // TODO has to be on the message!

    logger.info(basicLogMarker, sqsMessage.toString)

    extractS3KeyFromSqsMessage(sqsMessage) match {
      case Failure(exception) =>
        metrics.failedIngestsFromQueue.increment()
        logger.error(basicLogMarker, s"Failed to parse s3 data from SQS message", exception)
        Future.unit
      case Success(key) =>
        val s3IngestObject = S3IngestObject(key, store)(basicLogMarker)

        val isUiUpload = s3IngestObject.maybeMediaIdFromUiUpload.isDefined

        implicit val logMarker: LogMarker = basicLogMarker ++ Map(
          "uploadedBy" -> s3IngestObject.uploadedBy,
          "uploadedTime" -> s3IngestObject.uploadTime,
          "contentLength" -> s3IngestObject.contentLength,
          "filename" -> s3IngestObject.filename,
          "isUiUpload" -> isUiUpload,
        ) ++ s3IngestObject.maybeMediaIdFromUiUpload.map("mediaId" -> _).toMap
        val metricDimensions = List(
          new Dimension().withName("UploadedBy").withValue(s3IngestObject.uploadedBy),
          new Dimension().withName("IsUiUpload").withValue(isUiUpload.toString),
        )

        val approximateReceiveCount = getApproximateReceiveCount(sqsMessage)

        if(config.maybeUploadLimitInBytes.exists(_ < s3IngestObject.contentLength)){
          val errorMessage = s"File size exceeds the maximum allowed size (${config.maybeUploadLimitInBytes.get / 1_000_000}MB). Moving to fail bucket."
          logger.warn(logMarker, errorMessage)
          store.moveObjectToFailedBucket(s3IngestObject.key)
          s3IngestObject.maybeMediaIdFromUiUpload foreach { imageId =>
            uploadStatusTable.updateStatus( // fire & forget, since there's nothing else we can do
              imageId, UploadStatus(StatusType.Failed, Some(errorMessage))
            )
          }
          metrics.failedIngestsFromQueue.incrementBothWithAndWithoutDimensions(metricDimensions)
          Future.unit
        }
        else if (approximateReceiveCount > 2) {
          metrics.abandonedMessagesFromQueue.incrementBothWithAndWithoutDimensions(metricDimensions)
          val errorMessage = s"File processing has been attempted $approximateReceiveCount times. Moving to fail bucket."
          logger.warn(logMarker, errorMessage)
          store.moveObjectToFailedBucket(s3IngestObject.key)
          s3IngestObject.maybeMediaIdFromUiUpload foreach { imageId =>
            uploadStatusTable.updateStatus( // fire & forget, since there's nothing else we can do
              imageId, UploadStatus(StatusType.Failed, Some(errorMessage))
            )
          }
          Future.unit
        } else {
          attemptToProcessIngestedFile(s3IngestObject, isUiUpload)(instance) map { digestedFile =>
            metrics.successfulIngestsFromQueue.incrementBothWithAndWithoutDimensions(metricDimensions)
            logger.info(logMarker, s"Successfully processed image ${digestedFile.file.getName}")
            store.deleteObjectFromIngestBucket(s3IngestObject.key)
          } recover {
            case _: UnsupportedMimeTypeException =>
              metrics.failedIngestsFromQueue.incrementBothWithAndWithoutDimensions(metricDimensions)
              logger.info(logMarker, s"Unsupported mime type. Moving straight to fail bucket.")
              store.moveObjectToFailedBucket(s3IngestObject.key)
            case t: Throwable =>
              metrics.failedIngestsFromQueue.incrementBothWithAndWithoutDimensions(metricDimensions)
              logger.error(logMarker, s"Failed to process file. Moving to fail bucket.", t)
              store.moveObjectToFailedBucket(s3IngestObject.key)
          }
        }
    }
  }.flatten

  private def attemptToProcessIngestedFile(s3IngestObject:S3IngestObject, isUiUpload: Boolean)(initialLogMarker:LogMarker)(implicit instance: Instance): Future[DigestedFile] = {

    logger.info(initialLogMarker, "Attempting to process file")
    val tempFile = createTempFile("s3IngestBucketFile")(initialLogMarker)

    val digestedFile = downloader.download(
      inputStream = s3IngestObject.getInputStream(),
      tempFile,
      expectedSize = s3IngestObject.contentLength
    )
    implicit val logMarker: LogMarker = initialLogMarker ++ Map(
      "mediaId" -> digestedFile.digest
    )

    val futureUploadStatusUri = uploadDigestedFileToStore(
        digestedFileFuture = Future(digestedFile),
        uploadedBy = s3IngestObject.uploadedBy,
        identifiers =  None,
        uploadTime = Some(s3IngestObject.uploadTime.toString) , // upload time as iso string - uploader uses DateTimeUtils.fromValueOrNow
        filename = Some(s3IngestObject.filename),
    )

    // under all circumstances, remove the temp files
    futureUploadStatusUri.onComplete { _ =>
      Try { deleteTempFile(tempFile) }
    }

    if(isUiUpload) {
      updateUploadStatusTable(futureUploadStatusUri, digestedFile).map(_ => digestedFile)
    } else {
      futureUploadStatusUri.map(_ => digestedFile)
    }
  }

  def getPreSignedUploadUrlsAndTrack: Action[AnyContent] = AuthenticatedAndAuthorised.async { request =>
    implicit val instance: Instance = instanceOf(request)

    val expiration = DateTimeUtils.now().plusHours(1)

    val mediaIdToFilenameMap = request.body.asJson.get.as[Map[String, String]]

    val uploadedBy = Authentication.getIdentity(request.user)

    Future.sequence(

      mediaIdToFilenameMap.map{case (mediaId, filename) =>
        logger.info(s"Preparing file upload for instance $instance: $mediaId / $filename")

        val preSignedUrl = store.generatePreSignedUploadUrl(filename, expiration, uploadedBy, mediaId)

        uploadStatusTable.setStatus(UploadStatusRecord(
          id = mediaId,
          fileName = Some(filename),
          uploadedBy,
          uploadTime = DateTimeUtils.toString(DateTimeUtils.now()),
          identifiers = None,
          StatusType.Prepared,
          errorMessage = None,
          expires = expiration.toEpochSecond, // TTL in case upload is never completed by client
          instance = instance.id
        )).map(_ =>
          mediaId -> preSignedUrl
        )
      }
    )
    .map(_.toMap)
    .map(Json.toJson(_))
    .map(Ok(_))
  }

  def loadImage(uploadedBy: Option[String], identifiers: Option[String], uploadTime: Option[String], filename: Option[String]): Action[DigestedFile] = {
    val uploadTimeToRecord = DateTimeUtils.fromValueOrNow(uploadTime)

    val initialContext = MarkerMap(
        "requestType" -> "load-image",
        "uploadedBy" -> uploadedBy.getOrElse(FALLBACK),
        "identifiers" -> identifiers.getOrElse(FALLBACK),
        "uploadTime" -> uploadTimeToRecord.toString,
        "filename" -> filename.getOrElse(FALLBACK)
    )
    logger.info(initialContext, "loadImage request start")

    // synchronous write to file
    val tempFile = createTempFile("requestBody")(initialContext)
    logger.info(initialContext, "body parsed")
    val parsedBody = DigestBodyParser.create(tempFile)

    AuthenticatedAndAuthorised.async(parsedBody) { req =>
      implicit val instance: Instance = instanceOf(req)

      val uploadedByToRecord = uploadedBy.getOrElse(Authentication.getIdentity(req.user))

      implicit val context: LogMarker =
        initialContext ++ Map(
          "uploadedBy" -> uploadedByToRecord,
          "requestId" -> RequestLoggingFilter.getRequestId(req)
        )

      val uploadStatus = if(config.uploadToQuarantineEnabled) StatusType.Pending else StatusType.Completed
      val uploadExpiry = Instant.now.getEpochSecond + config.uploadStatusExpiry.toSeconds
      val record = UploadStatusRecord(req.body.digest, filename, uploadedByToRecord, printDateTime(uploadTimeToRecord), identifiers, uploadStatus, None, uploadExpiry, instance.id)
      logger.info(s"Loading image for instance ${instance.id}: record ${record.id} / $filename")

      val result = for {
        uploadRequest <- uploader.loadFile(
          req.body,
          uploadedByToRecord,
          identifiers,
          uploadTimeToRecord,
          filename.flatMap(_.trim.nonEmptyOpt),
          instance
        )
        _ <- uploadStatusTable.setStatus(record)

        result <- quarantineOrStoreImage(uploadRequest)(context, instance)

      } yield result
      result.onComplete( _ => Try { deleteTempFile(tempFile) } )

      result map { r =>
        val result = Accepted(r).as(ArgoMediaType)
        logger.info(context, "loadImage request end")
        result
      } recover {
        case NonFatal(e) =>
          logger.error(context, "loadImage request ended with a failure", e)
          val response = e match {
            case e: UnsupportedMimeTypeException => FailureResponse.unsupportedMimeType(e, config.supportedMimeTypes)
            case e: ImageProcessingException => FailureResponse.notAnImage(e, config.supportedMimeTypes)
            case e: java.io.IOException => FailureResponse.badImage(e)
            case other => FailureResponse.internalError(other)
          }
          FailureResponse.responseToResult(response)
      }
    }
  }

  // Fetch
  def projectImageBy(imageId: String): Action[AnyContent] = {

    val initialContext = MarkerMap(
      "imageId" -> imageId,
      "requestType" -> "image-projection"
    )
    val tempFile = createTempFile(s"projection-$imageId")(initialContext)
    auth.async { req =>
      implicit val instance: Instance = instanceOf(req)
      implicit val context: LogMarker = initialContext ++ Map(
        "requestId" -> RequestLoggingFilter.getRequestId(req)
      )
      val onBehalfOfFn: OnBehalfOfPrincipal = auth.getOnBehalfOfPrincipal(req.user)
      val result = projector.projectS3ImageById(imageId, tempFile, gridClient, onBehalfOfFn)

      result.onComplete( _ => Try { deleteTempFile(tempFile) } )

      result.map {
        case Some(img) =>
          logger.info(context, "image found")
          Ok(Json.toJson(img)).as(ArgoMediaType)
        case None =>
          val s3Path = "s3://" + config.imageBucket + "/" + ImageIngestOperations.fileKeyFromId(imageId, instance)
          logger.info(context, "image not found")
          respondError(NotFound, "image-not-found", s"Could not find image: $imageId in s3 at $s3Path")
      } recover {
        case _: NoSuchImageExistsInS3 => NotFound(Json.obj("imageId" -> imageId))
        case e =>
          logger.error(context, s"projectImageBy request for id $imageId ended with a failure", e)
          InternalServerError(Json.obj("imageId" -> imageId, "exception" -> e.getMessage))
      }
    }
  }

  def importImage(
                   uri: String,
                   uploadedBy: Option[String],
                   identifiers: Option[String],
                   uploadTime: Option[String],
                   filename: Option[String]
                 ): Action[AnyContent] = {
    AuthenticatedAndAuthorised.async { request =>
      implicit val instance: Instance = instanceOf(request)

      implicit val context: MarkerMap = MarkerMap(
        "requestType" -> "import-image",
        "key-tier" -> request.user.accessor.tier.toString,
        "key-name" -> request.user.accessor.identity,
        "requestId" -> RequestLoggingFilter.getRequestId(request)
      )

      logger.info(context, "importImage request start for $uri into instance $instance")

      val tempFile = createTempFile("download")
      val digestedFileFuture = for {
        validUri <- Future { URI.create(uri) }
        digestedFile <- downloader.download(validUri, tempFile)
      } yield digestedFile

      val uploadResultFuture = uploadDigestedFileToStore(
          digestedFileFuture,
          uploadedBy.getOrElse(Authentication.getIdentity(request.user)),
          identifiers,
          uploadTime,
          filename
      )

      // under all circumstances, remove the temp files
      uploadResultFuture.onComplete { _ =>
        Try { deleteTempFile(tempFile) }
      }

      // create a play result out of what has happened
      resolveUploadAndUpdateStatus(uploadResultFuture,digestedFileFuture).transform {
        // The upload request completed successfully and returned the uploadStatusUri for the image
        case Success(Right(uploadStatusUri)) => Success(Accepted(uploadStatusUri.toJsObject).as(ArgoMediaType)) // NB This return code (202) is explicitly required by s3-watcher. Anything else (eg 200) will be logged as an error. DAMHIKIJKOK.
        // The upload request completed by returning an anticipated error that has been mapped to a Response
        case Success(Left(failureResponse)) => Success(FailureResponse.responseToResult(failureResponse))
        // The download or upload failed with an unhandled non-fatal error
        case Failure(NonFatal(e)) => Success(FailureResponse.responseToResult(FailureResponse.internalError(e)))
        // Throw unhandled fatal exceptions.
        case Failure(other) => Failure(other)
      }
    }
  }

  private def uploadDigestedFileToStore (
    digestedFileFuture: Future[DigestedFile],
    uploadedBy: String,
    identifiers: Option[String],
    uploadTime: Option[String],
    filename: Option[String]
  )(implicit logMarker:LogMarker, instance: Instance): Future[UploadStatusUri] = {

    for {
        digestedFile <- digestedFileFuture
        uploadStatusResult <- uploadStatusTable.getStatus(digestedFile.digest)
        maybeStatus = uploadStatusResult.flatMap(_.toOption)
        uploadRequest <- uploader.loadFile(
          digestedFile,
          uploadedBy =  maybeStatus.map(_.uploadedBy).getOrElse(uploadedBy),
          identifiers =  maybeStatus.flatMap(_.identifiers).orElse(identifiers),
          uploadTime =  DateTimeUtils.fromValueOrNow(maybeStatus.map(_.uploadTime).orElse(uploadTime)),
          filename =  maybeStatus.flatMap(_.fileName).orElse(filename).flatMap(_.trim.nonEmptyOpt),
          instance
        )
        result <- uploader.storeFile(uploadRequest)
      } yield {
        logger.info(logMarker, "importImage request end")
        result
      }
  }

  private def resolveUploadAndUpdateStatus (
   uploadResultFuture: Future[UploadStatusUri],
   digestedFileFuture: Future[DigestedFile],
  )(implicit logMarker:LogMarker, instance: Instance):Future[Either[Response,UploadStatusUri]] = {
    // combine the import result and digest file together into a single future
    uploadResultFuture.transformWith { // note that we use transformWith instead of zip here as we are still interested in value of digestedFile even if the import fails
      maybeImportResult =>
        digestedFileFuture.map(digestedFile =>
          digestedFile -> maybeImportResult
        )
    }.flatMap { case (digestedFile, triedStatusUri) =>
      // convert any exception from the upload to a failure response, or pass the uploadStatusUri if successful
      val failureResponseOrUploadStatusUri = triedStatusUri match {
        case Failure(e: UnsupportedMimeTypeException) => Left(FailureResponse.unsupportedMimeType(e, config.supportedMimeTypes))
        case Failure(_: IllegalArgumentException) => Left(FailureResponse.invalidUri)
        case Failure(e: UserImageLoaderException) => Left(FailureResponse.badUserInput(e))
        case Failure(NonFatal(_)) => Left(FailureResponse.failedUriDownload)
        case Failure(e) => throw e // this is a "fatal" error - let it be fatal
        case Success(uploadStatusUri) => Right(uploadStatusUri)
      }
      // build a Failed StatusType from the failure response or Completed if successful
      val status = failureResponseOrUploadStatusUri match {
        case Left(Response(_, response)) => UploadStatus(StatusType.Failed, Some(s"${response.errorKey}: ${response.errorMessage}"))
        case Right(_) => UploadStatus(StatusType.Completed, None)
      }
      // try to update uploadStatusTable, log the outcome
      uploadStatusTable.updateStatus(digestedFile.digest, status).flatMap{ outcomeOfUpdateStatus => //FIXME use set status to avoid potential ConditionNotMet (when status table rows have expired/TTL)
        outcomeOfUpdateStatus match {
          case Left(_: ConditionNotMet) => logger.info(logMarker, s"no image upload status to update for image ${digestedFile.digest}")
          case Left(error) => logger.error(logMarker, s"an error occurred while updating image upload status, image-id:${digestedFile.digest}, error:$error")
          case Right(_) => logger.info(logMarker, s"image upload status updated successfully, image-id: ${digestedFile.digest}")
        }

        // after status update completes or fails, return the failureResponseOrUploadStatusUri from the upload
        Future.successful(failureResponseOrUploadStatusUri)
      }
    }
  }

  private def updateUploadStatusTable(
    uploadAttempt: Future[UploadStatusUri],
    digestedFile: DigestedFile
  )(implicit logMarker: LogMarker, instance: Instance): Future[Unit] = {

    def reportFailure(error: Throwable): Unit = {
      val errorMessage = s"an error occurred while updating image upload status, error:$error"
      logger.error(logMarker, errorMessage, error)
      Future.failed(new Exception(errorMessage))
    }

    def reportScanamoError(error: ScanamoError): Unit = {
      val errorMessage = error match {
        case ConditionNotMet(_) => s"ConditionNotMet error occurred while updating image upload status, image-id:${digestedFile.digest}, error:$error"
        case _ => s"an error occurred while updating image upload status, image-id:${digestedFile.digest}, error:$error"
      }
      logger.error(logMarker, errorMessage)
      Future.failed(new Exception(errorMessage))
    }

    uploadAttempt.transformWith {
        case Failure(uploadFailure) =>
          logger.error(logMarker, s"Image upload failed: ${uploadFailure.getMessage}", uploadFailure)
          uploadStatusTable.updateStatus( //FIXME use set status to avoid potential ConditionNotMet (when status table rows have expired/TTL)
            digestedFile.digest,
            UploadStatus(StatusType.Failed, Some(s"${uploadFailure.getClass.getName}: ${uploadFailure.getMessage}"))
          )

        case Success(_) =>
          uploadStatusTable.updateStatus( //FIXME use set status to avoid potential ConditionNotMet (when status table rows have expired/TTL)
            digestedFile.digest,
            UploadStatus(StatusType.Completed, None)
          )
      }
      .map {
        case Left(error: ScanamoError) => reportScanamoError(error)
        case Right(_) => ()
      }.recover {
        case error => reportFailure(error)
      }
  }

  lazy val replicaS3: AmazonS3 = S3Ops.buildS3Client(config, maybeRegionOverride = Some("us-west-1"))

  private case class RestoreFromReplicaForm(imageId: String)
  def restoreFromReplica: Action[AnyContent] = AuthenticatedAndAuthorised.async { implicit request =>
    implicit val instance: Instance = instanceOf(request)

    val imageId = Form(
      mapping(
        "imageId" -> text
      )(RestoreFromReplicaForm.apply)(RestoreFromReplicaForm.unapply)
    ).bindFromRequest().get.imageId

    implicit val logMarker: LogMarker = MarkerMap(
      "imageId" -> imageId,
      "requestType" -> "restore-from-replica",
      "requestId" -> RequestLoggingFilter.getRequestId(request)
    )

    Future {
      config.maybeImageReplicaBucket match {
        case _ if store.doesOriginalExist(imageId, instance) =>
          Future.successful(Conflict("Image already exists in main bucket"))
        case None =>
          Future.successful(NotImplemented("No replica bucket configured"))
        case Some(replicaBucket) if replicaS3.doesObjectExist(replicaBucket, fileKeyFromId(imageId, instance)) =>
          val s3Key = fileKeyFromId(imageId, instance)

          logger.info(logMarker, s"Restoring image $imageId from replica bucket $replicaBucket (key: $s3Key)")

          val replicaObject = replicaS3.getObject(replicaBucket, s3Key)
          val metadata = S3FileExtractedMetadata(replicaObject.getObjectMetadata)
          val stream = replicaObject.getObjectContent
          val tempFile = createTempFile(s"restoringReplica-$imageId")
          val fos = new FileOutputStream(tempFile)
          try {
            IOUtils.copy(stream, fos)
          } finally {
            stream.close()
          }

          val future = uploader.restoreFile(
            UploadRequest(
              imageId,
              tempFile, // would be nice to stream directly from S3, but followed the existing pattern of temp file
              mimeType = MimeTypeDetection.guessMimeType(tempFile) match {
                case Left(unsupported) => throw unsupported
                case right => right.toOption
              },
              metadata.uploadTime,
              metadata.uploadedBy,
              metadata.identifiers,
              UploadInfo(metadata.uploadFileName),
              instance
            ),
            gridClient,
            auth.getOnBehalfOfPrincipal(request.user)
          )

          future.onComplete(_ => Try {
            deleteTempFile(tempFile)
          })

          future.map { _ =>
            logger.info(logMarker, s"Restored image $imageId from replica bucket $replicaBucket (key: $s3Key)")
            Redirect(s"${config.kahunaUri(instance)}/images/$imageId")
          }
        case _ =>
          Future.successful(NotFound("Image not found in replica bucket"))
      }
    }.flatten
  }

  // Find this a better home if used more widely
  implicit class NonEmpty(s: String) {
    def nonEmptyOpt: Option[String] = if (s.isEmpty) None else Some(s)
  }

  // To avoid Future _madness_, it is better to make temp files at the controller and pass them down,
  // then clear them up again at the end.  This avoids leaks.
  def createTempFile(prefix: String)(implicit logMarker: LogMarker): File = {
    val tempFile = File.createTempFile(prefix, "", config.tempDir)
    logger.info(logMarker, s"Created temp file ${tempFile.getName} in ${config.tempDir}")
    tempFile
  }

  def deleteTempFile(tempFile: File)(implicit logMarker: LogMarker): Future[Unit] = Future {
    if (tempFile.delete()) {
      logger.info(logMarker, s"Deleted temp file $tempFile")
    } else {
      logger.warn(logMarker, s"Unable to delete temp file $tempFile in ${config.tempDir}")
    }
  }

}
