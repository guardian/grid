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
}
