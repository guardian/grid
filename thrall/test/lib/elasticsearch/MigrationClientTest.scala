package lib.elasticsearch

import com.gu.mediaservice.lib.elasticsearch.{InProgress, NotRunning}
import com.gu.mediaservice.lib.logging.LogMarker

class MigrationClientTest extends ElasticSearchTestBase {
  implicit val lm: LogMarker = new LogMarker{
    override def markerContents: Map[String, Any] = Map.empty
  }

  "Migration" - {
    "status should return as NotRunning on a clean ES" in {
      assert(ES.migration.refreshAndRetrieveStatus() === NotRunning)
    }
    "starting a migration should change the migration status" in {
      val newIndexName = "images-test-migration"
      ES.startMigration(newIndexName)
      assert(ES.migration.refreshAndRetrieveStatus() === InProgress(newIndexName))
    }
  }

}
