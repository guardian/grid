package lib


object Buckets {

  val bucketRegex = "^[-a-z0-9]+$"

  def validBucket(name: String): Boolean = name matches bucketRegex

}
