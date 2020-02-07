package com.gu.mediaservice

package object indexing {

  case class ProduceProgress(name: String, stateId: Int)

  object IndexInputCreation {

    val NotStarted = ProduceProgress("at rest", 0)
    val InProgress = ProduceProgress("in progress", 1)
    val NotFound = ProduceProgress("not found", 2)
    val Finished = ProduceProgress("finished", 3)
    val Reset = ProduceProgress("reset because of failure", 0)

  }

}
