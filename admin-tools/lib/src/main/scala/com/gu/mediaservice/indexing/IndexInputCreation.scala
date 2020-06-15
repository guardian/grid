package com.gu.mediaservice.indexing

object IndexInputCreation {

  val NotStarted = ProduceProgress("at rest", 0)
  val InProgress = ProduceProgress("in progress", 1)
  val NotFound = ProduceProgress("not found by image-loader", 2)
  val Enqueued = ProduceProgress("enqueued", 3)
  val Reset = ProduceProgress("reset because of failure", 0)
  val KnownError = ProduceProgress("blacklisted because of known failure", 4)
  val Locating = ProduceProgress("looking for image", 5)
  val Verified = ProduceProgress("image verified in media-api – reingestion complete", 6)
  val Inconsistent = ProduceProgress("re-ingested image not found in media-api", 7)
  val UnknownError = ProduceProgress("blacklisted because of unknown failure", 8)
  val TooBig = ProduceProgress("too big, putting back down", 9001)

  private val all = List(
    NotStarted,
    InProgress,
    NotFound,
    Enqueued,
    Reset,
    KnownError,
    Locating,
    Verified,
    Inconsistent,
    UnknownError,
    TooBig
  )

  def get(id: Int) =
    all.find(_.stateId == id)
      .getOrElse(IndexInputCreation.NotStarted)

}

