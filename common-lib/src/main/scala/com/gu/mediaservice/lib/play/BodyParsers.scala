package com.gu.mediaservice.lib.play

import java.io.{FileOutputStream, File}
import java.security.MessageDigest

import scala.concurrent.ExecutionContext
import scala.util.{Left, Right, Either}

import play.api.libs.iteratee.Iteratee
import play.api.mvc.BodyParser
import play.api.mvc.Results.Status
import play.api.Logger

case class DigestedFile(file: File, digest: String)

object DigestedFile {
  def apply(file: File, digest: Array[Byte]): DigestedFile =
    DigestedFile(file, digest.map("%02x".format(_)).mkString)
}

object BodyParsers {

  def digestedFile(to: File)(implicit ex: ExecutionContext): BodyParser[DigestedFile] =
    BodyParser("digested file, to=" + to) { request => {
      Iteratee.fold[Array[Byte], (MessageDigest, FileOutputStream)](
        (MessageDigest.getInstance("SHA-1"), new FileOutputStream(to))) {

        case ((md, os), data) => {
          md.update(data)
          os.write(data)

          (md, os)
        }

      }.map { case (md, os) =>
        os.close()
        request.headers.get("Content-Length").foldLeft[Either[Status, DigestedFile]](Left(Status(411))) {
          (_,expectedContentLength) => {
            if(to.length==expectedContentLength.toInt) Right(DigestedFile(to, md.digest))
            else {
              Logger.info("Received file does not match specified 'Content-Length'")
              Left(Status(400))
            }
          }
        }
      }
    }
  }
}
