package lib.play

import java.io.{FileOutputStream, File}
import java.security.MessageDigest
import scala.concurrent.ExecutionContext

import org.apache.commons.codec.binary.{Base32, Hex}
import play.api.libs.iteratee.Iteratee
import play.api.mvc.BodyParser


case class MD5DigestedFile(file: File, digest: Vector[Byte]) {
  def digestAsHex: String = new String((new Hex).encode(digest.toArray))
  def digestAsBase32: String = (new Base32).encodeAsString(digest.toArray)
}

object BodyParsers {

  def digestedFile(to: File)(implicit ex: ExecutionContext): BodyParser[MD5DigestedFile] =
    BodyParser("digested file, to=" + to) { request =>
      Iteratee.fold[Array[Byte], (MessageDigest, FileOutputStream)]((MessageDigest.getInstance("MD5"), new FileOutputStream(to))) {
        case ((md, os), data) =>
          md.digest(data)
          os.write(data)
          (md, os)
      }.map { case (md, os) =>
        os.close()
        Right(MD5DigestedFile(to, md.digest.toVector))
      }
    }

}
