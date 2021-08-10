package lib.elasticsearch

import com.gu.mediaservice.lib.logging.LogMarker

class MigrationClientTest extends ElasticSearchTestBase {
  implicit val lm: LogMarker = new LogMarker{
    override def markerContents: Map[String, Any] = Map.empty
  }

  val migrationClient: MigrationClient = new MigrationClient(elasticSearchConfig, None)

  "Migration" - {
    "status should return as NotRunning on a clean ES" in {
      assert(migrationClient.getStatus() === NotRunning)
    }
    "starting a migration should change the migration status" in {
      migrationClient.startMigration("images-test-migration")
      assert(migrationClient.getStatus() === InProgress)
    }
  }


}
