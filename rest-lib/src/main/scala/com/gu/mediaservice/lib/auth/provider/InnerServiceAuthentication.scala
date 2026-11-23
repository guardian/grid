package com.gu.mediaservice.lib.auth.provider

import com.gu.mediaservice.lib.auth.Authentication.InnerServicePrincipal
import com.gu.mediaservice.lib.auth.provider.InnerServiceAuthentication.innerServiceIdentityHeaderName
import com.gu.mediaservice.lib.auth.provider.InnerServiceAuthentication.innerServiceUUIDHeaderName
import com.gu.mediaservice.lib.auth.provider.InnerServiceAuthentication.innerServiceTimestampHeaderName
import org.joda.time.{DateTime, DateTimeZone, Duration}
import play.api.libs.crypto.CookieSigner
import play.api.libs.typedmap.{TypedKey, TypedMap}
import play.api.libs.ws.WSRequest
import play.api.mvc.RequestHeader

import java.util.UUID
import scala.util.Try

object InnerServiceAuthentication {
  val innerServiceIdentityHeaderName = "X-Inner-Service-Identity"
  val innerServiceUUIDHeaderName = "X-Inner-Service-UUID"
  val innerServiceTimestampHeaderName = "X-Inner-Service-Timestamp"
}

trait InnerServiceAuthentication {
  import InnerServiceAuthentication._
  val innerServiceSignatureHeaderName = "X-Inner-Service-Signature"

  val uuidKey: TypedKey[String] = TypedKey("UUID")
  val timestampKey: TypedKey[String] = TypedKey("timestamp")
  val signatureKey: TypedKey[String] = TypedKey("signature")

  val signer: CookieSigner

  val serviceName: String

  def signRequest(wsRequest: WSRequest, identityPrefix: String = ""): WSRequest = {
    val signingData = SigningData(
      identity = identityPrefix + serviceName,
      uuid = UUID.randomUUID().toString,
      timestamp = DateTime.now(DateTimeZone.UTC).toString,
      method = wsRequest.method,
      target = wsRequest.uri.getRawPath()
    )
    wsRequest.addHttpHeaders(
      innerServiceIdentityHeaderName -> signingData.identity,
      innerServiceUUIDHeaderName -> signingData.uuid,
      innerServiceTimestampHeaderName -> signingData.timestamp,
      innerServiceSignatureHeaderName -> signingData.signature
    )
  }

  def verifyRequest(request: RequestHeader)(signatureFromHeader: String) = {

    val signingData = SigningData.from(request)

    signingData match {
      case Some(d) if d.validate(signatureFromHeader) =>
        Right(
          InnerServicePrincipal(
            identity = request.headers(innerServiceIdentityHeaderName),
            attributes = TypedMap.empty + (
              uuidKey -> request.headers(innerServiceUUIDHeaderName),
              timestampKey -> d.timestamp,
              signatureKey -> d.signature
            )
          )
        )
      case _ =>
        Left("Invalid inner service signature")
    }
  }

  private case class SigningData(
    identity: String,
    uuid: String,
    timestamp: String,
    method: String,
    target: String
  ) {
    override def toString() = List(identity, uuid, timestamp, method, target).mkString(".")

    lazy val signature = signer.sign(toString)

    private def isTimestampRecent: Boolean =
      Try {
        val time = DateTime.parse(timestamp)
        val difference = new Duration(time, DateTime.now(DateTimeZone.UTC)).getMillis
        difference > -3000 && difference < 3000
      }.getOrElse(false)

    def validate(candidateSignature: String) = candidateSignature == signature && isTimestampRecent
  }

  private object SigningData {
    def from(requestHeader: RequestHeader) =
      for {
        identity <- requestHeader.headers.get(innerServiceIdentityHeaderName)
        uuid <- requestHeader.headers.get(innerServiceUUIDHeaderName)
        timestamp <- requestHeader.headers.get(innerServiceTimestampHeaderName)
        target <- Try(java.net.URI.create(requestHeader.uri).getRawPath).toOption
        method = requestHeader.method
      } yield SigningData(identity, uuid, timestamp, method, target)
  }
}
