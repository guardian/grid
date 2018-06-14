package test.lib

import java.io.File

object ResourceHelpers {

  def fileAt(resourcePath: String): File = {
    new File(getClass.getResource(s"/$resourcePath").toURI)
  }

}
