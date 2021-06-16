package com.gu.mediaservice.lib.auth.provider

import com.gu.mediaservice.lib.auth.Authentication.InnerServicePrincipal
import org.joda.time.{DateTime, DateTimeZone}
import play.api.libs.crypto.CookieSigner
import play.api.libs.typedmap.{TypedKey, TypedMap}
import play.api.libs.ws.WSRequest
import play.api.mvc.RequestHeader

import java.util.UUID

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

  private def generateSignature(headers: Map[String, Seq[String]]): String = {
    signer.sign(
      List(
        headers(innerServiceIdentityHeaderName),
        headers(innerServiceUUIDHeaderName),
        headers(innerServiceTimestampHeaderName)
      ).mkString(".")
    )
  }

  def signRequest(wsRequest: WSRequest, identityPrefix: String = ""): WSRequest = {
    val requestToBeSigned = wsRequest.addHttpHeaders(
      innerServiceIdentityHeaderName -> (identityPrefix + serviceName),
      innerServiceUUIDHeaderName -> UUID.randomUUID().toString,
      innerServiceTimestampHeaderName -> DateTime.now(DateTimeZone.UTC).toString
    )
    requestToBeSigned.addHttpHeaders(
      innerServiceSignatureHeaderName -> generateSignature(requestToBeSigned.headers)
    )
  }

  def verifyRequest(request: RequestHeader)(signatureFromHeader: String) = {
    val signature = generateSignature(request.headers.toMap)
    if (signature == signatureFromHeader)
      Right(InnerServicePrincipal(
        identity = request.headers(innerServiceIdentityHeaderName),
        attributes = TypedMap.empty + (
          uuidKey -> request.headers(innerServiceUUIDHeaderName),
          timestampKey -> request.headers(innerServiceTimestampHeaderName),
          signatureKey -> signature
        )
    ))
    else
      Left("Invalid inner service signature")
  }
}
