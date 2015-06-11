package com.gu.mediaservice.lib.play

import java.io.{FileOutputStream, File}
import java.security.MessageDigest

import scala.concurrent.ExecutionContext
import scala.util.{Left, Right, Either}

import play.api.libs.iteratee.Iteratee

import play.api.mvc.Results.Status
import play.api.mvc._

import play.api.Logger

import com.gu.mediaservice.lib.argo.ArgoHelpers

case class DigestedFile(file: File, digest: String)

object DigestedFile {
  def apply(file: File, digest: Array[Byte]): DigestedFile =
    DigestedFile(file, digest.map("%02x".format(_)).mkString)
}

object DigestBodyParser extends ArgoHelpers {

  def slurp(to: File)(implicit ec: ExecutionContext): Iteratee[Array[Byte],(MessageDigest, FileOutputStream)]= {
      Iteratee.fold[Array[Byte], (MessageDigest, FileOutputStream)](
        (MessageDigest.getInstance("SHA-1"), new FileOutputStream(to))) {

        case ((md, os), data) => {
          md.update(data)
          os.write(data)

          (md, os)
        }
     }
  }

  val missingContenLengthError = respondError(
    Status(411),
    "missing-content-length",
    s"Missing content-length. Please specify a correct 'Content-Length' header"
  )

  val incorrectContentLengthError = respondError(
    Status(400),
    "incorrect-content-length",
    s"Incorrect content-length. The specified content-length does match that of the received file."
  )

  def validate(request: RequestHeader, to: File, md: MessageDigest): Either[Result, DigestedFile] = {
    request.headers.get("Content-Length").foldLeft[Either[Result, DigestedFile]](Left(missingContenLengthError)) {
      (_,expectedContentLength) => {
        if(to.length==expectedContentLength.toInt) Right(DigestedFile(to, md.digest))
        else {
          Logger.info("Received file does not match specified 'Content-Length'")
          Left(incorrectContentLengthError)
        }
      }
    }
  }

  def create(to: File)(implicit ex: ExecutionContext): BodyParser[DigestedFile] =
    BodyParser("digested file, to=" + to) { request => {
      slurp(to).map { case (md, os) =>
        os.close()
        validate(request, to, md)
      }
    }
  }
}
