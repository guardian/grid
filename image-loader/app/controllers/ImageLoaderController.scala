package controllers

import org.apache.pekko.Done
import org.apache.pekko.stream.Materializer
import org.apache.pekko.stream.scaladsl.Source
import software.amazon.awssdk.services.sqs.model.{Message => SQSMessage}
import com.drew.imaging.ImageProcessingException
import com.gu.mediaservice.GridClient
import com.gu.mediaservice.lib.ImageIngestOperations.fileKeyFromId
import com.gu.mediaservice.lib.argo.ArgoHelpers
import com.gu.mediaservice.lib.argo.model.Link
import com.gu.mediaservice.lib.auth.Authentication.OnBehalfOfPrincipal
import com.gu.mediaservice.lib.auth.Permissions.UploadImages
import com.gu.mediaservice.lib.auth._
import com.gu.mediaservice.lib.aws.{S3Ops, SimpleSqsMessageConsumer, SqsHelpers}
import com.gu.mediaservice.lib.formatting.printDateTime
import com.gu.mediaservice.lib.logging.{FALLBACK, LogMarker, MarkerMap}
import com.gu.mediaservice.lib.play.RequestLoggingFilter
import com.gu.mediaservice.lib.{DateTimeUtils, ImageIngestOperations, ImageStorageProps}
import com.gu.mediaservice.model.{UnsupportedMimeTypeException, UploadInfo}
import org.scanamo.{ConditionNotMet, ScanamoError}
import lib.imaging.{MimeTypeDetection, NoSuchImageExistsInS3}
import lib.storage.{ImageLoaderStore, S3FileDoesNotExistException}
import lib._
import model.upload.UploadRequest
import model.{Projector, QuarantineUploader, S3FileExtractedMetadata, S3IngestObject, StatusType, UploadStatus, UploadStatusRecord, UploadStatusUri, Uploader}
import org.joda.time.{DateTime, DateTimeZone}
import play.api.data.Form
import play.api.data.Forms._
import play.api.inject.ApplicationLifecycle
import play.api.libs.json.Json
import play.api.libs.streams.Accumulator
import play.api.mvc._
import software.amazon.awssdk.regions.Region
import software.amazon.awssdk.services.cloudwatch.model.Dimension
import software.amazon.awssdk.services.s3.S3Client
import software.amazon.awssdk.services.s3.model.{GetObjectRequest, HeadObjectRequest, NoSuchKeyException}

import java.io.{File, FileOutputStream}
import java.time.{Duration, Instant}
import java.util.concurrent.atomic.AtomicReference
import scala.concurrent.{ExecutionContext, Future}
import scala.jdk.CollectionConverters.MapHasAsScala
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
                            metrics: ImageLoaderMetrics,
                            applicationLifecycle: ApplicationLifecycle)
                           (implicit val ec: ExecutionContext, materializer: Materializer)
  extends BaseController with ArgoHelpers with SqsHelpers {

  private val AuthenticatedAndAuthorised = auth andThen authorisation.CommonActionFilters.authorisedForUpload

  private def authenticatedDigestBodyParser(logMarker: LogMarker): BodyParser[DigestedFile] =
    BodyParser("authenticated image upload") { request =>
      auth.authenticationStatus(request, gracePeriodCountsAsAuthenticated = true) match {
        case Left(result) =>
          Accumulator.done(result.map(response => Left(response): Either[Result, DigestedFile]))
        case Right(principal) if !authorisation.hasPermissionTo(UploadImages)(principal) =>
          Accumulator.done(Future.successful(Left(authorisation.forbidden(UploadImages))))
        case Right(_) =>
          val tempFile = createTempFile("requestBody")(logMarker)
          val parser = DigestBodyParser.create(tempFile)(ec)(request).mapFuture {
            case Right(digestedFile) => Future.successful(Right(digestedFile))
            case Left(result) => deleteTempFile(tempFile)(logMarker).map(_ => Left(result))
          }
          parser.recoverWith {
            case error => cleanupTempFile(tempFile, logMarker)(Future.failed(error))
          }
      }
    }

  private def cleanupTempFile[A](file: File, logMarker: LogMarker)(result: Future[A]): Future[A] =
    result.transformWith { completed =>
      deleteTempFile(file)(logMarker).transform {
        case Success(_) => completed
        case Failure(cleanupError) =>
          completed match {
            case Success(_) => Failure(cleanupError)
            case Failure(operationError) =>
              operationError.addSuppressed(cleanupError)
              Failure(operationError)
          }
      }
    }

  private val activeProcessingMessage = new AtomicReference[Option[SQSMessage]](None)

  // when shutting down, make best efforts to make currently processing image available on the queue again
  applicationLifecycle.addStopHook(() => {
    (activeProcessingMessage.get(), maybeIngestQueue) match {
      case (Some(message), Some(ingestQueue)) =>
        Future { ingestQueue.makeMessageVisible(message) }
      case _ =>
        Future.successful(())
    }
  })

  val maybeIngestQueueAndProcessor: Option[(SimpleSqsMessageConsumer, Future[Done])] = maybeIngestQueue.map { ingestQueue =>
    val processor = Source.repeat(())
      .mapAsyncUnordered(parallelism=1)(_ => {
        ingestQueue.getNextMessage(attrApproximateReceiveCount) match {
          case None =>
            activeProcessingMessage.set(None)
            Future.successful(logger.debug(s"No message at ${DateTimeUtils.now()}"))
          case Some(sqsMessage) =>
            activeProcessingMessage.set(Some(sqsMessage))
            val logMarker: LogMarker = MarkerMap(
              "requestType" -> "handleMessageFromIngestBucket",
              "requestId" -> sqsMessage.messageId(),
            )
            handleMessageFromIngestBucket(sqsMessage)(logMarker)
              .recover {
                case _: S3FileDoesNotExistException => ()
              }
              .map { _ =>
                logger.info(logMarker, "Deleting message")
                ingestQueue.deleteMessage(sqsMessage)
                activeProcessingMessage.set(None)
              }
              .recover {
                case t: Throwable =>
                  metrics.failedIngestsFromQueue.increment()
                  activeProcessingMessage.set(None)
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

  private lazy val indexResponse: Result = {
    val indexData = Map("description" -> "This is the Loader Service")
    val indexLinks = List(
      Link("prepare", s"${config.rootUri}/prepare"),
      Link("uploadStatus", s"${config.rootUri}/uploadStatus/{id}"),
      Link("uploadStatuses", s"${config.rootUri}/uploadStatuses"),
      Link("load", s"${config.rootUri}/images{?uploadedBy,identifiers,uploadTime,filename}")
    )
    respond(indexData, indexLinks)
  }

  def index: Action[AnyContent] = AuthenticatedAndAuthorised { indexResponse }

  private def quarantineOrStoreImage(uploadRequest: UploadRequest)(implicit logMarker: LogMarker) = {
    quarantineUploader.map(_.quarantineFile(uploadRequest)).getOrElse(for { uploadStatusUri <- uploader.storeFile(uploadRequest)} yield{uploadStatusUri.toJsObject})
  }

  private def handleMessageFromIngestBucket(sqsMessage:SQSMessage)(basicLogMarker: LogMarker): Future[Unit] = Future[Future[Unit]]{

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
          Dimension.builder().name("UploadedBy").value(s3IngestObject.uploadedBy).build(),
          Dimension.builder().name("IsUiUpload").value(isUiUpload.toString).build(),
        )

        val approximateReceiveCount = getApproximateReceiveCount(sqsMessage)

        if(config.maybeUploadLimitInBytes.exists(_ < s3IngestObject.contentLength)){
          val errorMessage = s"File size exceeds the maximum allowed size (${config.maybeUploadLimitInBytes.get / 1_000_000}MB). Moving to fail bucket. (${s3IngestObject.key})"
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
          val errorMessage = s"File processing has been attempted $approximateReceiveCount times. Moving to fail bucket. (${s3IngestObject.key})"
          logger.warn(logMarker, errorMessage)
          store.moveObjectToFailedBucket(s3IngestObject.key)
          s3IngestObject.maybeMediaIdFromUiUpload foreach { imageId =>
            uploadStatusTable.updateStatus( // fire & forget, since there's nothing else we can do
              imageId, UploadStatus(StatusType.Failed, Some(errorMessage))
            )
          }
          Future.unit
        } else {
          attemptToProcessIngestedFile(s3IngestObject, isUiUpload)(logMarker) map { digestedFile =>
            metrics.successfulIngestsFromQueue.incrementBothWithAndWithoutDimensions(metricDimensions)
            logger.info(logMarker, s"Successfully processed image ${digestedFile.file.getName}")
            store.deleteObjectFromIngestBucket(s3IngestObject.key)
          } recover {
            case _: UnsupportedMimeTypeException =>
              metrics.failedIngestsFromQueue.incrementBothWithAndWithoutDimensions(metricDimensions)
              logger.info(logMarker, s"Unsupported mime type. Moving straight to fail bucket. (${s3IngestObject.key})")
              store.moveObjectToFailedBucket(s3IngestObject.key)
            case t: Throwable =>
              metrics.failedIngestsFromQueue.incrementBothWithAndWithoutDimensions(metricDimensions)
              logger.error(logMarker, s"Failed to process file. Moving to fail bucket. (${s3IngestObject.key})", t)
              store.moveObjectToFailedBucket(s3IngestObject.key)
          }
        }
    }
  }.flatten

  private def attemptToProcessIngestedFile(s3IngestObject:S3IngestObject, isUiUpload: Boolean)(initialLogMarker:LogMarker): Future[DigestedFile] = {

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
        identifiers =  s3IngestObject.identifiers,
        uploadTime = Some(s3IngestObject.uploadTime.toString) , // upload time as iso string - uploader uses DateTimeUtils.fromValueOrNow
        filename = Some(s3IngestObject.filename)
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
    val expiration = DateTimeUtils.now().plusHours(1)
    val signatureDuration = Duration.ofHours(1)

    val mediaIdToFilenameMap = request.body.asJson.get.as[Map[String, String]]

    val uploadedBy = Authentication.getIdentity(request.user)

    Future.sequence(

      mediaIdToFilenameMap.map{case (mediaId, filename) =>

        val preSignedUrl = store.generatePreSignedUploadUrl(filename, signatureDuration, uploadedBy, mediaId)

        uploadStatusTable.setStatus(UploadStatusRecord(
          id = mediaId,
          fileName = Some(filename),
          uploadedBy,
          uploadTime = DateTimeUtils.toString(DateTimeUtils.now()),
          identifiers = None,
          StatusType.Prepared,
          errorMessage = None,
          expires = expiration.toEpochSecond, // TTL in case upload is never completed by client
        )).map(_ =>
          mediaId -> preSignedUrl
        )
      }
    )
    .map(_.toMap)
    .map(Json.toJson(_))
    .map(Ok(_))
  }

  def loadImage(uploadedBy: Option[String], identifiers: Option[String], uploadTime: Option[String], filename: Option[String]): Action[DigestedFile] =  {
    val uploadTimeToRecord = DateTimeUtils.fromValueOrNow(uploadTime)

    val initialContext = MarkerMap(
        "requestType" -> "load-image",
        "uploadedBy" -> uploadedBy.getOrElse(FALLBACK),
        "identifiers" -> identifiers.getOrElse(FALLBACK),
        "uploadTime" -> uploadTimeToRecord.toString,
        "filename" -> filename.getOrElse(FALLBACK)
    )
    logger.info(initialContext, "loadImage request start")

    val bodyParser = authenticatedDigestBodyParser(initialContext)

    AuthenticatedAndAuthorised.async(bodyParser) { req =>
      logger.info(initialContext, "body parsed")
      val uploadedByToRecord = uploadedBy.getOrElse(Authentication.getIdentity(req.user))

      implicit val context: LogMarker =
        initialContext ++ Map(
          "uploadedBy" -> uploadedByToRecord,
          "requestId" -> RequestLoggingFilter.getRequestId(req)
        )

      val uploadStatus = if(config.maybeQuarantineBucket.isDefined) StatusType.Pending else StatusType.Completed
      val uploadExpiry = Instant.now.getEpochSecond + config.uploadStatusExpiry.toSeconds
      val record = UploadStatusRecord(req.body.digest, filename, uploadedByToRecord, printDateTime(uploadTimeToRecord), identifiers, uploadStatus, None, uploadExpiry)
      val result = for {
        uploadRequest <- uploader.loadFile(
          req.body,
          uploadedByToRecord,
          identifiers.map(Json.parse(_).as[Map[String, String]]).getOrElse(Map.empty),
          uploadTimeToRecord,
          filename.flatMap(_.trim.nonEmptyOpt)
        )
        _ <- uploadStatusTable.setStatus(record)
        result <- quarantineOrStoreImage(uploadRequest)
      } yield result
      cleanupTempFile(req.body.file, context)(result).map { r =>
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

  def enqueueDerivativeImage(derivativeOfMediaIds: String, filename: String, uploadedBy: Option[String], identifiers: Option[String], uploadTime: Option[String]): Action[DigestedFile] = {
    val uploadTimeToRecord = DateTimeUtils.fromValueOrNow(uploadTime)

    implicit val initialContext = MarkerMap(
      "requestType" -> "load-image",
      "uploadedBy" -> uploadedBy.getOrElse(FALLBACK),
      "identifiers" -> identifiers.getOrElse(FALLBACK),
      "uploadTime" -> uploadTimeToRecord.toString,
      "filename" -> filename
    )
    logger.info(initialContext, "enqueueDerivativeImage request start")

    val bodyParser = authenticatedDigestBodyParser(initialContext)

    AuthenticatedAndAuthorised.async(bodyParser) { req =>

      val allIdentifiers = identifiers.map(Json.parse(_).as[Map[String, String]]).getOrElse(Map.empty) ++ Map(
        ImageStorageProps.derivativeOfMediaIdsIdentifierKey -> derivativeOfMediaIds
      )

      val s3UserMetaMap = allIdentifiers.map { case (k, v) =>
        (s"${ImageStorageProps.identifierMetadataKeyPrefix}$k", v)
      }

      val queued = store.queueS3Object(
        uploader = uploadedBy.getOrElse(Authentication.getIdentity(req.user)),
        filename = filename,
        s3Meta = s3UserMetaMap,
        file = req.body.file
      ).map {_ =>
        val newMediaId: String = req.body.digest

        // return just the new media ID for now, though perhaps in future we could track these in the upload status table and provide the URI to the relevant entry
        Accepted(newMediaId)
      }
      cleanupTempFile(req.body.file, initialContext)(queued)
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
          val s3Path = "s3://" + config.imageBucket + "/" + ImageIngestOperations.fileKeyFromId(imageId)
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

  private def uploadDigestedFileToStore (
    digestedFileFuture: Future[DigestedFile],
    uploadedBy: String,
    identifiers: Map[String, String],
    uploadTime: Option[String],
    filename: Option[String]
  )(implicit logMarker:LogMarker): Future[UploadStatusUri] = {

    for {
        digestedFile <- digestedFileFuture
        uploadStatusResult <- uploadStatusTable.getStatus(digestedFile.digest)
        maybeStatus = uploadStatusResult.flatMap(_.toOption)
        uploadRequest <- uploader.loadFile(
          digestedFile,
          uploadedBy =  maybeStatus.map(_.uploadedBy).getOrElse(uploadedBy),
          identifiers =  maybeStatus.flatMap(
            _.identifiers.map(Json.parse(_).as[Map[String, String]])
          ).getOrElse(identifiers),
          uploadTime =  DateTimeUtils.fromValueOrNow(maybeStatus.map(_.uploadTime).orElse(uploadTime)),
          filename =  maybeStatus.flatMap(_.fileName).orElse(filename).flatMap(_.trim.nonEmptyOpt),
        )
        result <- uploader.storeFile(uploadRequest)
      } yield {
        logger.info(logMarker, "importImage request end")
        result
      }
  }

  private def updateUploadStatusTable(
    uploadAttempt: Future[UploadStatusUri],
    digestedFile: DigestedFile
  )(implicit logMarker: LogMarker): Future[Unit] = {

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

  lazy val replicaS3: S3Client = S3Ops.buildS3Client(config, maybeRegionOverride = Some(Region.US_WEST_1))

  private case class RestoreFromReplicaForm(imageId: String)
  def restoreFromReplica: Action[AnyContent] = AuthenticatedAndAuthorised.async { implicit request =>

    def doesReplicaExist(bucket: String, key: String) = {
      try {
        replicaS3.headObject(HeadObjectRequest.builder().bucket(bucket).key(key).build())
        true
      } catch {
        case _: NoSuchKeyException => false
      }
    }

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

    val s3Key = fileKeyFromId(imageId)

    Future {
      config.maybeImageReplicaBucket match {
        case _ if store.doesOriginalExist(imageId) =>
          Future.successful(Conflict("Image already exists in main bucket"))
        case None =>
          Future.successful(NotImplemented("No replica bucket configured"))
        case Some(replicaBucket) if doesReplicaExist(replicaBucket, s3Key) =>
          logger.info(logMarker, s"Restoring image $imageId from replica bucket $replicaBucket (key: $s3Key)")

          val replicaObject = replicaS3.getObject(
            GetObjectRequest.builder().bucket(replicaBucket).key(s3Key).build()
          )
          val lastModified = replicaObject.response().lastModified()
          val metaMap = replicaObject.response().metadata().asScala.toMap
          val metadata = S3FileExtractedMetadata.apply(new DateTime(lastModified.toEpochMilli).withZone(DateTimeZone.UTC), metaMap)
          val tempFile = createTempFile(s"restoringReplica-$imageId")
          val fos = new FileOutputStream(tempFile)
          try {
            replicaObject.transferTo(fos)
          } finally {
            replicaObject.close()
            fos.close()
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
              UploadInfo(metadata.uploadFileName)
            ),
            gridClient,
            auth.getOnBehalfOfPrincipal(request.user)
          )

          future.onComplete(_ => Try {
            deleteTempFile(tempFile)
          })

          future.map { _ =>
            logger.info(logMarker, s"Restored image $imageId from replica bucket $replicaBucket (key: $s3Key)")
            Redirect(s"${config.kahunaUri}/images/$imageId")
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
