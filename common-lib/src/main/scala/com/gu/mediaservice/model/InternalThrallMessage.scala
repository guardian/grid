package com.gu.mediaservice.model

import org.joda.time.DateTime

sealed trait InternalThrallMessage extends ThrallMessage {

}

/**
  * Message to start a new 'migration' (for re-index, re-ingestion etc.)
  * @param migrationStart timestamp representing when a migration commenced
  * @param gitHash the git commit hash (of the grid repo) at the point the migration commenced
  */
case class CreateMigrationIndexMessage(
  migrationStart: DateTime,
  gitHash: String
) extends InternalThrallMessage
