package com.gu.mediaservice

import org.mockito.ArgumentCaptor
import org.mockito.ArgumentMatchers.any
import org.mockito.Mockito.{times, verify, when}
import org.scalatest.funspec.AnyFunSpec
import org.scalatest.matchers.should.Matchers
import org.scalatestplus.mockito.MockitoSugar
import software.amazon.awssdk.services.secretsmanager.SecretsManagerClient
import software.amazon.awssdk.services.secretsmanager.model.{GetSecretValueRequest, GetSecretValueResponse}

class FastlyApiKeyProviderTest extends AnyFunSpec with Matchers with MockitoSugar {
  describe("FastlyApiKeyProvider") {
    it("loads the configured secret once and caches it") {
      val client = mock[SecretsManagerClient]
      when(client.getSecretValue(any[GetSecretValueRequest]))
        .thenReturn(GetSecretValueResponse.builder().secretString("the-api-key").build())
      val provider = FastlyApiKeyProvider.fromEnvironment(
        Map(FastlyApiKeyProvider.SecretIdEnvironmentVariable -> "fastly-secret-arn"),
        client
      )

      provider.apiKey shouldBe "the-api-key"
      provider.apiKey shouldBe "the-api-key"

      val request = ArgumentCaptor.forClass(classOf[GetSecretValueRequest])
      verify(client, times(1)).getSecretValue(request.capture())
      request.getValue.secretId() shouldBe "fastly-secret-arn"
    }

    it("fails without creating a client when the secret ID is not configured") {
      var clientCreated = false

      val exception = intercept[IllegalStateException] {
        FastlyApiKeyProvider.fromEnvironment(Map.empty, {
          clientCreated = true
          mock[SecretsManagerClient]
        })
      }

      exception.getMessage shouldBe "FASTLY_API_KEY_SECRET_ID is not set"
      clientCreated shouldBe false
    }

    it("fails when the secret has no SecretString value") {
      val client = mock[SecretsManagerClient]
      when(client.getSecretValue(any[GetSecretValueRequest]))
        .thenReturn(GetSecretValueResponse.builder().build())
      val provider = FastlyApiKeyProvider.fromEnvironment(
        Map(FastlyApiKeyProvider.SecretIdEnvironmentVariable -> "fastly-secret-arn"),
        client
      )

      val exception = intercept[IllegalStateException](provider.apiKey)

      exception.getMessage shouldBe "Secret fastly-secret-arn has no SecretString value"
    }
  }
}

