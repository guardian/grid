package com.gu.mediaservice

package object indexing {

  case class ProduceProgress(name: String, stateId: Int)

  object IndexInputCreation {

    val NotStarted = ProduceProgress("at rest", 0)
    val InProgress = ProduceProgress("in progress", 1)
    val NotFound = ProduceProgress("not found", 2)
    val Finished = ProduceProgress("finished", 3)
    val Reset = ProduceProgress("reset because of failure", 0)
    val KnownError = ProduceProgress("blacklisted because of known failure", 4)
    val Locating = ProduceProgress("looking for image",5)
    val Found = ProduceProgress("image found", 6)
    val Inconsistent = ProduceProgress("re-ingested image not found in media-api", 7)
    val UnknownError = ProduceProgress("blacklisted because of unknown failure", 8)
    val TooBig = ProduceProgress("too big, putting back down", 9001)

    val all = List(
      NotStarted,
      InProgress,
      NotFound,
      Finished,
      Reset,
      KnownError,
      Locating,
      Found,
      Inconsistent,
      UnknownError,
      TooBig
    )

    def get(id: Int) = all.find(_.stateId == id).getOrElse(NotStarted)

  }

}
