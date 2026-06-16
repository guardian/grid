package com.gu.mediaservice.lib

import org.scalatest.funspec.AnyFunSpec
import org.scalatest.matchers.should.Matchers


class VectorUtilsTest extends AnyFunSpec with Matchers {
  it ("should compute the dot product of two vectors") {
    VectorUtils.dotProduct(List(1.0, 2.0, 3.0), List(4.0, 5.0, 6.0)) shouldBe 32.0
  }

  it ("should compute a dot product of zero for orthogonal vectors") {
    VectorUtils.dotProduct(List(1.0, 0.0), List(0.0, 1.0)) shouldBe 0.0
  }

  it ("should return zero for the dot product of empty vectors") {
    VectorUtils.dotProduct(List.empty, List.empty) shouldBe 0.0
  }

  it ("should compute the magnitude of a vector") {
    VectorUtils.magnitude(List(3.0, 4.0)) shouldBe 5.0
  }

  it ("should return a magnitude of zero for a zero vector") {
    VectorUtils.magnitude(List(0.0, 0.0, 0.0)) shouldBe 0.0
  }

  it ("should return a cosine similarity of 1 for identical vectors") {
    VectorUtils.cosineSimilarity(List(1.0, 2.0, 3.0), List(1.0, 2.0, 3.0)) shouldBe 1.0 +- 1e-9
  }

  it ("should return a cosine similarity of 1 for parallel vectors") {
    VectorUtils.cosineSimilarity(List(1.0, 2.0, 3.0), List(2.0, 4.0, 6.0)) shouldBe 1.0 +- 1e-9
  }

  it ("should return a cosine similarity of 0 for orthogonal vectors") {
    VectorUtils.cosineSimilarity(List(1.0, 0.0), List(0.0, 1.0)) shouldBe 0.0 +- 1e-9
  }

  it ("should return a cosine similarity of -1 for opposite vectors") {
    VectorUtils.cosineSimilarity(List(1.0, 2.0, 3.0), List(-1.0, -2.0, -3.0)) shouldBe -1.0 +- 1e-9
  }

  it ("should return a cosine similarity of 0 when the first vector has zero magnitude") {
    VectorUtils.cosineSimilarity(List(0.0, 0.0, 0.0), List(1.0, 2.0, 3.0)) shouldBe 0.0 +- 1e-9
  }

  it ("should return a cosine similarity of 0 when the second vector has zero magnitude") {
    VectorUtils.cosineSimilarity(List(1.0, 2.0, 3.0), List(0.0, 0.0, 0.0)) shouldBe 0.0 +- 1e-9
  }

  it ("should return a cosine similarity of 0 when both vectors have zero magnitude") {
    VectorUtils.cosineSimilarity(List(0.0, 0.0, 0.0), List(0.0, 0.0, 0.0)) shouldBe 0.0 +- 1e-9
  }
}
