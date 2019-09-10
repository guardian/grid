package lib

import com.gu.mediaservice.model.Image
import org.joda.time.DateTime.now

object TestUtils {

  val img = Image(
    id = "test-id",
    uploadTime = now(),
    uploadedBy = "user",
    lastModified = None,
    identifiers = Map.empty,
    uploadInfo = null,
    source = null,
    thumbnail = None,
    optimisedPng = None,
    fileMetadata = null,
    userMetadata = None,
    metadata = null,
    originalMetadata = null,
    usageRights = null,
    originalUsageRights = null
  )

}
