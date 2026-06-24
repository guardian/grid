package com.gu.mediaservice.lib

import org.scalatest.Inspectors
import org.scalatest.OptionValues
import org.scalatest.funspec.AnyFunSpec
import org.scalatest.matchers.should.Matchers
import org.scalacheck.Gen
import VectorUtils.{dotProduct, magnitude, cosineSimilarity, firstBasisVector, vectorWithCosineSimilarity}


class VectorUtilsTest extends AnyFunSpec with Matchers with Inspectors with OptionValues {
  describe("dotProduct") {
    it ("should compute the dot product of two vectors") {
      dotProduct(List(1.0, 2.0, 3.0), List(4.0, 5.0, 6.0)) shouldBe 32.0
    }

    it ("should compute a dot product of zero for orthogonal vectors") {
      dotProduct(List(1.0, 0.0), List(0.0, 1.0)) shouldBe 0.0
    }

    it ("should return zero for the dot product of empty vectors") {
      dotProduct(List.empty, List.empty) shouldBe 0.0
    }

    it ("should reject vectors of differing dimensionality") {
      an [IllegalArgumentException] should be thrownBy dotProduct(List(1.0, 2.0), List(1.0, 2.0, 3.0))
    }
  }

  describe("magnitude") {
    it ("should compute the magnitude of a vector") {
      magnitude(List(3.0, 4.0)) shouldBe 5.0
    }

    it ("should return a magnitude of zero for a zero vector") {
      magnitude(List(0.0, 0.0, 0.0)) shouldBe 0.0
    }
  }

  describe("cosineSimilarity") {
    it ("should return a cosine similarity of 1 for identical vectors") {
      cosineSimilarity(List(1.0, 2.0, 3.0), List(1.0, 2.0, 3.0)).value shouldBe 1.0 +- 1e-9
    }

    it ("should return a cosine similarity of 1 for parallel vectors") {
      cosineSimilarity(List(1.0, 2.0, 3.0), List(2.0, 4.0, 6.0)).value shouldBe 1.0 +- 1e-9
    }

    it ("should return a cosine similarity of 0 for orthogonal vectors") {
      cosineSimilarity(List(1.0, 0.0), List(0.0, 1.0)).value shouldBe 0.0 +- 1e-9
    }

    it ("should return a cosine similarity of -1 for opposite vectors") {
      cosineSimilarity(List(1.0, 2.0, 3.0), List(-1.0, -2.0, -3.0)).value shouldBe -1.0 +- 1e-9
    }

    it ("should be undefined (None) when the first vector has zero magnitude") {
      cosineSimilarity(List(0.0, 0.0, 0.0), List(1.0, 2.0, 3.0)) shouldBe None
    }

    it ("should be undefined (None) when the second vector has zero magnitude") {
      cosineSimilarity(List(1.0, 2.0, 3.0), List(0.0, 0.0, 0.0)) shouldBe None
    }

    it ("should be undefined (None) when both vectors have zero magnitude") {
      cosineSimilarity(List(0.0, 0.0, 0.0), List(0.0, 0.0, 0.0)) shouldBe None
    }

    it ("should be undefined (None) when the vectors differ in dimensionality") {
      cosineSimilarity(List(1.0, 2.0), List(1.0, 2.0, 3.0)) shouldBe None
    }
  }

  describe("vectorWithCosineSimilarity") {
    val dims = 256
    val tolerance = 1e-9

    it ("should create a vector at the requested cosine similarity across a fine sweep of the valid range") {
      val similarities = (-1000 to 1000).map(_ / 1000.0)
      forAll(similarities) { s =>
        cosineSimilarity(firstBasisVector(dims), vectorWithCosineSimilarity(dims, s)).value shouldBe s +- tolerance
      }
    }

    it ("should create a vector at the requested cosine similarity for randomly generated similarities") {
      val similarityGen = Gen.chooseNum(-1.0, 1.0)
      val samples = Gen.listOfN(500, similarityGen).sample.getOrElse(Nil)
      samples should not be empty
      forAll(samples) { s =>
        cosineSimilarity(firstBasisVector(dims), vectorWithCosineSimilarity(dims, s)).value shouldBe s +- tolerance
      }
    }

    it ("should work across a range of dimensions") {
      forAll(List(2, 3, 8, 16, 128, 256, 1024)) { n =>
        cosineSimilarity(firstBasisVector(n), vectorWithCosineSimilarity(n, 0.42)).value shouldBe 0.42 +- tolerance
      }
    }

    it ("should return a vector identical to the basis vector for a similarity of 1") {
      vectorWithCosineSimilarity(dims, 1.0) shouldBe firstBasisVector(dims)
      cosineSimilarity(firstBasisVector(dims), vectorWithCosineSimilarity(dims, 1.0)).value shouldBe 1.0 +- tolerance
    }

    it ("should return a vector opposite to the basis vector for a similarity of -1") {
      cosineSimilarity(firstBasisVector(dims), vectorWithCosineSimilarity(dims, -1.0)).value shouldBe -1.0 +- tolerance
    }

    it ("should return a vector orthogonal to the basis vector for a similarity of 0") {
      cosineSimilarity(firstBasisVector(dims), vectorWithCosineSimilarity(dims, 0.0)).value shouldBe 0.0 +- tolerance
    }

    it ("should negate the vector when the similarity is negated") {
      val positive = vectorWithCosineSimilarity(dims, 0.25)
      val negative = vectorWithCosineSimilarity(dims, -0.25)
      forAll(positive.zip(negative)) { case (p, n) => n shouldBe (-p) +- tolerance }
    }

    it ("should produce only finite components for valid similarities") {
      forAll(List(-1.0, -0.5, -1e-3, 0.0, 1e-3, 0.5, 1.0)) { s =>
        forAll(vectorWithCosineSimilarity(dims, s)) { component =>
          component.isNaN shouldBe false
          component.isInfinite shouldBe false
        }
      }
    }

    it ("should reject a similarity greater than 1") {
      an [IllegalArgumentException] should be thrownBy vectorWithCosineSimilarity(dims, 1.0001)
    }

    it ("should reject a similarity less than -1") {
      an [IllegalArgumentException] should be thrownBy vectorWithCosineSimilarity(dims, -1.0001)
    }

    it ("should reject fewer than 2 dimensions") {
      an [IllegalArgumentException] should be thrownBy vectorWithCosineSimilarity(1, 0.5)
    }
  }
}
