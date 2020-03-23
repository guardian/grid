package lib.imaging

class ImageLoaderException(val message: String) extends RuntimeException(message)

class UserImageLoaderException(override val message: String) extends ImageLoaderException(message)
class UnsupportedMimeTypeException(val mimeType: String)
  extends UserImageLoaderException(s"Mime type value '$mimeType' is not supported")

class ServerImageLoaderException(override val message: String) extends ImageLoaderException(message)
class NoSuchImageExistsInS3(val bucket: String, val key: String)
  extends ServerImageLoaderException(s"Could not find image in $bucket with key $key")
