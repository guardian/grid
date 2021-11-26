package lib

final case class FailedMigrationDetails(imageId: String, lastModified: String, crops: String, usages: String)

final case class FailedMigrationSummary(totalFailed: Long, details: Seq[FailedMigrationDetails])

final case class FailedMigrationsGrouping(message: String, count: Long, exampleIDs: Seq[String])

final case class FailedMigrationsOverview(totalFailed: Long, grouped: Seq[FailedMigrationsGrouping])
