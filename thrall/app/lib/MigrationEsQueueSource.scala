package lib

import akka.event.LogMarker
import akka.stream.scaladsl.Source
import akka.stream.{Attributes, Outlet, SourceShape}
import akka.stream.stage.{GraphStage, GraphStageLogic, OutHandler}
import com.gu.mediaservice.lib.elasticsearch.InProgress
import com.gu.mediaservice.lib.logging.{LogMarker, MarkerMap}
import com.sksamuel.elastic4s.ElasticDsl
import com.sksamuel.elastic4s.requests.searches.SearchHit
import lib.elasticsearch.ElasticSearch

import scala.collection.mutable
import scala.concurrent.ExecutionContext

class MigrationEsQueueSource(es: ElasticSearch)(implicit ec: ExecutionContext) extends GraphStage[SourceShape[SearchHit]] {
  val out: Outlet[SearchHit] = Outlet("MigrationEsQueueSource")
  override val shape: SourceShape[SearchHit] = SourceShape(out)

  override def createLogic(inheritedAttributes: Attributes): GraphStageLogic =
    new GraphStageLogic(shape) {
      val esRecordsStack: mutable.Stack[SearchHit] = mutable.Stack()

      setHandler(out, new OutHandler {
        override def onPull(): Unit = {
          es.migrationStatus match {
            case InProgress(migrationIndexName) =>
              // TODO
              // check current stack; if nonEmpty: push(out, esRecordsStack.pop())
              //                      if empty: fetch next batch and assign to stack, push top element on completion
              if (esRecordsStack.isEmpty) {
                getAsyncCallback()
                es.getNextBatchOfImageIdsToMigrate(migrationIndexName)
                  .map(hits => esRecordsStack.pushAll(hits))
              } else {

              }
            case _ =>
              // TODO clear stack; do not push anything?
          }
        }
      })
    }
}
