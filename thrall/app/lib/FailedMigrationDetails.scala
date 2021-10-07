package lib

final case class FailedMigrationDetails(imageId: String, cause: String)

final case class FailedMigrationSummary(totalFailed: Long, totalFailedRelation: String, returned: Long, details: Seq[FailedMigrationDetails])
