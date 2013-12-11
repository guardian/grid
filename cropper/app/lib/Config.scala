package lib

import com.gu.mediaservice.lib.config.Properties
import java.io.File


object Config {

  val properties = Properties.fromPath("/etc/gu/cropper.properties")

  val tempDir: File = new File(properties.getOrElse("crop.output.tmp.dir", "/tmp"))

  val imagickThreadPoolSize = 4
}
