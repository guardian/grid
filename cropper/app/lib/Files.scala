package lib

import java.io.{FileOutputStream, File}
import java.nio.channels.Channels
import java.net.URL


object Files {

  def createTempFile(prefix: String, suffix: String): File =
    File.createTempFile(prefix, suffix, Config.tempDir)

  def transferFromURL(from: URL, to: File) = {
    val channel = Channels.newChannel(from.openStream)
    val output = new FileOutputStream(to)
    output.getChannel.transferFrom(channel, 0, java.lang.Long.MAX_VALUE)
  }

}
