package com.gu.mediaservice.lib

object VectorUtils {
  def dotProduct(vectorOne: List[Double], vectorTwo: List[Double]): Double = {
    vectorOne.zip(vectorTwo).map(component => component._1 * component._2).sum
  }

  def magnitude(vector: List[Double]): Double = {
    math.sqrt(vector.map(math.pow(_, 2)).sum)
  }

  def cosineSimilarity(vectorOne: List[Double], vectorTwo: List[Double]): Double = {
    val magnitudeProduct = magnitude(vectorOne) * magnitude(vectorTwo)
    if (magnitudeProduct == 0.0) 0.0
    else dotProduct(vectorOne, vectorTwo) / magnitudeProduct
  }

  // The below functions are primarily for constructing artificial vectors for tests
  private def oneHotVector(dims: Int, hotIndex: Int): List[Double] =
    List.tabulate(dims)(i => if (i == hotIndex) 1.0 else 0.0)

  // The first standard basis vector e0: (1, 0, 0, ...).
  def firstBasisVector(dims: Int): List[Double] = oneHotVector(dims, 0)

  private def vectorWithComponents(dims: Int, components: (Int, Double)*): List[Double] = {
    val arr = Array.fill(dims)(0.0)
    components.foreach { case (i, v) => arr(i) = v }
    arr.toList
  }

  // Builds a vector whose cosine similarity with the first basis vector equals
  // the requested `similarity` (in [-1, 1], where 1 is identical and 0 is orthogonal).
  def vectorWithCosineSimilarity(dims: Int, similarity: Double): List[Double] = {
    // Assert that similarity is between -1 and 1
    require(similarity >= -1.0 && similarity <= 1.0, "Cosine similarity must be between -1 and 1")
    if (similarity == 0.0) {
      // A cosine similarity of 0 means orthogonal to the first basis vector.
      // That vector is one-hot at index 0, so any vector with a zero
      // first component is orthogonal to it; (0, 1) is the simplest choice.
      oneHotVector(dims, 1)
    } else {
      val absVec2D = {
        // Let's pretend we're in just 2 dimensions and think about triangles.
        // (Diagram would help here!)
        // Our queryEmbedding lies flat on the x axis.
        // If we want cos 0 to be 1/n, e.g. 1/2,
        // then the adjacent side must be 1, and the hypotenuse n.
        // We want to find the opposite side
        // n^2 = 1^2 + adj^2
        // opposite = sqrt(n^2 - 1)
        // The two components of our vector are therefore (1, sqrt(n^2 - 1))
        val n = 1 / Math.abs(similarity)
        (1, Math.sqrt(Math.pow(n, 2) - 1))
      }
      val vec2D = if (similarity < 0.0) (-absVec2D._1, -absVec2D._2) else absVec2D
      vectorWithComponents(dims, 0 -> vec2D._1, 1 -> vec2D._2)
    }
  }
}
