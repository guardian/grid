package lib.elasticsearch

import com.gu.mediaservice.lib.elasticsearch.{InProgress, NotRunning}
import com.gu.mediaservice.lib.logging.LogMarker
import com.gu.mediaservice.model.Instance

import java.util.UUID

class MigrationStatusProviderTest extends ElasticSearchTestBase {

  override val instance: Instance = Instance(UUID.randomUUID().toString)

  implicit val lm: LogMarker = new LogMarker{
    override def markerContents: Map[String, Any] = Map.empty
  }

  "Migration" - {
    "status should return as NotRunning on a clean ES" in {
      assert(ES.refreshAndRetrieveMigrationStatus(instance) === NotRunning)
    }
    "starting a migration should change the migration status" in {
      val newIndexName = instance.id + "_images-test-migration"
      implicit val i: Instance = instance
      ES.startMigration(newIndexName)
      assert(ES.refreshAndRetrieveMigrationStatus(instance) === InProgress(newIndexName))
    }
  }

}
