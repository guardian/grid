package lib.elasticsearch

import com.gu.mediaservice.lib.logging.LogMarker

class MigrationTest extends ElasticSearchTestBase {
  implicit val lm: LogMarker = new LogMarker{
    override def markerContents: Map[String, Any] = Map.empty
  }

  val migration: Migration = new Migration(elasticSearchConfig, None)

  "Migration" - {
    "status should return as NotRunning on a clean ES" in {
      assert(migration.getStatus() === NotRunning)
    }
    "starting a migration should change the migration status" in {
      migration.startMigration()
      assert(migration.getStatus() === InProgress)
    }
  }


}
