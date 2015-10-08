package com.gu.mediaservice.lib

import java.io.{File, FileOutputStream}
import java.net.URL
import java.nio.channels.Channels
import java.util.concurrent.Executors

import scala.concurrent.{ExecutionContext, Future}


object Files {

  private implicit val ctx = ExecutionContext.fromExecutor(Executors.newCachedThreadPool)

  def createTempFile(prefix: String, suffix: String, tempDir: File): Future[File] =
    Future {
      File.createTempFile(prefix, suffix, tempDir)
    }

  def transferFromURL(from: URL, to: File): Future[Unit] =
    Future {
      val channel = Channels.newChannel(from.openStream)
      val output = new FileOutputStream(to)
      output.getChannel.transferFrom(channel, 0, java.lang.Long.MAX_VALUE)
    }

  def tempFileFromURL(from: URL, prefix: String, suffix: String, tempDir: File): Future[File] =
    for {
      tempFile <- createTempFile(prefix, suffix, tempDir: File)
      _ <- transferFromURL(from, tempFile)
    }
    yield tempFile

  def delete(file: File): Future[Unit] =
    Future(file.delete())

}
