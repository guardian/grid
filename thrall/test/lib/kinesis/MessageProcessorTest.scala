package lib.kinesis

import com.gu.mediaservice.lib.logging.{LogMarker, MarkerMap}
import com.gu.mediaservice.model.{DeleteImageMessage, NoRights, SyndicationRights, UpdateImageSyndicationMetadataMessage}
import helpers.Fixtures
import lib.{MetadataEditorNotifications, ThrallStore}
import lib.elasticsearch.{ElasticSearch, ElasticSearchDeleteResponse, ElasticSearchUpdateResponse, ImageNotDeletable}
import org.joda.time.DateTime
import org.mockito.ArgumentMatchers.any
import org.mockito.Mockito.{never, verify, when}
import org.scalatest.concurrent.ScalaFutures
import org.scalatest.funspec.AnyFunSpec
import org.scalatest.matchers.should.Matchers
import org.scalatestplus.mockito.MockitoSugar

import scala.concurrent.{ExecutionContext, Future, Promise}

class MessageProcessorTest extends AnyFunSpec with Matchers with ScalaFutures with MockitoSugar with Fixtures {
  private implicit val ec: ExecutionContext = ExecutionContext.parasitic
  private val marker: LogMarker = MarkerMap()
  private val image = createImage("image-id", NoRights)

  private class Fixture {
    val es: ElasticSearch = mock[ElasticSearch]
    val store: ThrallStore = mock[ThrallStore]
    val processor = new MessageProcessor(es, store, mock[MetadataEditorNotifications])
  }

  describe("syndication updates") {
    it("waits for the Elasticsearch updates to complete") {
      val f = new Fixture
      val update = Promise[List[ElasticSearchUpdateResponse]]()
      when(f.es.getImage(any[String])(any[ExecutionContext], any[LogMarker]))
        .thenReturn(Future.successful(Some(image)))
      when(f.es.updateImageSyndicationRights(any[String], any[Option[SyndicationRights]], any[DateTime])(any[ExecutionContext], any[LogMarker]))
        .thenReturn(update.future)

      val result = f.processor.process(UpdateImageSyndicationMetadataMessage(image.id, DateTime.now, None), marker)

      result.isCompleted shouldBe false
      update.success(List(ElasticSearchUpdateResponse()))
      result.futureValue
    }

    it("propagates Elasticsearch update failures") {
      val f = new Fixture
      val update = Promise[List[ElasticSearchUpdateResponse]]()
      val failure = new RuntimeException("update failed")
      when(f.es.getImage(any[String])(any[ExecutionContext], any[LogMarker]))
        .thenReturn(Future.successful(Some(image)))
      when(f.es.updateImageSyndicationRights(any[String], any[Option[SyndicationRights]], any[DateTime])(any[ExecutionContext], any[LogMarker]))
        .thenReturn(update.future)

      val result = f.processor.process(UpdateImageSyndicationMetadataMessage(image.id, DateTime.now, None), marker)
      update.failure(failure)

      result.failed.futureValue shouldBe failure
    }

    it("still succeeds without writing when the image is missing") {
      val f = new Fixture
      when(f.es.getImage(any[String])(any[ExecutionContext], any[LogMarker]))
        .thenReturn(Future.successful(None))

      f.processor.process(UpdateImageSyndicationMetadataMessage(image.id, DateTime.now, None), marker).futureValue

      verify(f.es, never()).updateImageSyndicationRights(any[String], any[Option[SyndicationRights]], any[DateTime])(any[ExecutionContext], any[LogMarker])
    }
  }

  describe("image deletion") {
    it("waits for all S3 deletions after Elasticsearch deletion") {
      val f = new Fixture
      val original = Promise[Unit]()
      val thumbnail = Promise[Unit]()
      val png = Promise[Unit]()
      val deletion = Promise[List[ElasticSearchDeleteResponse]]()
      when(f.es.deleteImage(any[String])(any[ExecutionContext], any[LogMarker]))
        .thenReturn(deletion.future)
      when(f.store.deleteOriginal(any[String])(any[LogMarker])).thenReturn(original.future)
      when(f.store.deleteThumbnail(any[String])(any[LogMarker])).thenReturn(thumbnail.future)
      when(f.store.deletePNG(any[String])(any[LogMarker])).thenReturn(png.future)

      val result = f.processor.process(DeleteImageMessage(image.id, DateTime.now), marker)

      result.isCompleted shouldBe false
      verify(f.store, never()).deleteOriginal(any[String])(any[LogMarker])
      verify(f.store, never()).deleteThumbnail(any[String])(any[LogMarker])
      verify(f.store, never()).deletePNG(any[String])(any[LogMarker])
      deletion.success(List(ElasticSearchDeleteResponse(), ElasticSearchDeleteResponse()))
      result.isCompleted shouldBe false
      original.success(())
      thumbnail.success(())
      result.isCompleted shouldBe false
      png.success(())
      result.futureValue

      verify(f.store).deleteOriginal(any[String])(any[LogMarker])
      verify(f.store).deleteThumbnail(any[String])(any[LogMarker])
      verify(f.store).deletePNG(any[String])(any[LogMarker])
    }

    it("propagates S3 deletion failures") {
      val f = new Fixture
      val failure = new RuntimeException("delete failed")
      when(f.es.deleteImage(any[String])(any[ExecutionContext], any[LogMarker]))
        .thenReturn(Future.successful(List(ElasticSearchDeleteResponse())))
      when(f.store.deleteOriginal(any[String])(any[LogMarker])).thenReturn(Future.failed(failure))
      when(f.store.deleteThumbnail(any[String])(any[LogMarker])).thenReturn(Future.successful(()))
      when(f.store.deletePNG(any[String])(any[LogMarker])).thenReturn(Future.successful(()))

      f.processor.process(DeleteImageMessage(image.id, DateTime.now), marker).failed.futureValue shouldBe failure
    }

    it("still succeeds without deleting S3 objects when the image is protected") {
      val f = new Fixture
      when(f.es.deleteImage(any[String])(any[ExecutionContext], any[LogMarker]))
        .thenReturn(Future.failed(ImageNotDeletable))

      f.processor.process(DeleteImageMessage(image.id, DateTime.now), marker).futureValue

      verify(f.store, never()).deleteOriginal(any[String])(any[LogMarker])
      verify(f.store, never()).deleteThumbnail(any[String])(any[LogMarker])
      verify(f.store, never()).deletePNG(any[String])(any[LogMarker])
    }
  }
}
