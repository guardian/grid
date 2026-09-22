package com.gu.mediaservice

import software.amazon.awssdk.services.secretsmanager.SecretsManagerClient
import software.amazon.awssdk.services.secretsmanager.model.GetSecretValueRequest

private[mediaservice] trait FastlyApiKeyProvider {
  def apiKey: String
}

private[mediaservice] class SecretsManagerFastlyApiKeyProvider(
  client: SecretsManagerClient,
  secretId: String
) extends FastlyApiKeyProvider {
  override lazy val apiKey: String = {
    val request = GetSecretValueRequest.builder().secretId(secretId).build()
    val secret = Option(client.getSecretValue(request).secretString())
      .filter(_.trim.nonEmpty)
      .getOrElse(throw new IllegalStateException(s"Secret $secretId has no SecretString value"))

    secret
  }
}

private[mediaservice] object FastlyApiKeyProvider {
  val SecretIdEnvironmentVariable = "FASTLY_API_KEY_SECRET_ID"

  lazy val default: FastlyApiKeyProvider = fromEnvironment(sys.env, SecretsManagerClient.create())

  def fromEnvironment(
    environment: Map[String, String],
    client: => SecretsManagerClient
  ): FastlyApiKeyProvider = {
    val secretId = environment.get(SecretIdEnvironmentVariable)
      .filter(_.trim.nonEmpty)
      .getOrElse(throw new IllegalStateException(s"$SecretIdEnvironmentVariable is not set"))

    new SecretsManagerFastlyApiKeyProvider(client, secretId)
  }
}

