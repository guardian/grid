/*
Lifted from https://github.com/playframework/playframework/blob/master/framework/src/play/src/main/scala/play/api/data/Form.scala

Why? To address this issue: https://github.com/playframework/playframework/issues/4346
 */

package lib

import play.api.data.validation.Constraint
import play.api.data.{FormError, Mapping}

case class TrueOptionalMapping[T](wrapped: Mapping[T], val constraints: Seq[Constraint[Option[T]]] = Nil) extends Mapping[Option[T]] {

  override val format: Option[(String, Seq[Any])] = wrapped.format

  /**
   * The field key.
   */
  val key = wrapped.key

  /**
   * Constructs a new Mapping based on this one, by adding new constraints.
   *
   * For example:
   * {{{
   *   import play.api.data._
   *   import validation.Constraints._
   *
   *   Form("phonenumber" -> text.verifying(required) )
   * }}}
   *
   * @param constraints the constraints to add
   * @return the new mapping
   */
  def verifying(addConstraints: Constraint[Option[T]]*): Mapping[Option[T]] = {
    this.copy(constraints = constraints ++ addConstraints.toSeq)
  }

  /**
   * Binds this field, i.e. constructs a concrete value from submitted data.
   *
   * @param data the submitted data
   * @return either a concrete value of type `T` or a set of error if the binding failed
   */
  def bind(data: Map[String, String]): Either[Seq[FormError], Option[T]] = {
    data.keys.filter(p => p == key || p.startsWith(key + ".") || p.startsWith(key + "[")).map(k => data.get(k)).collect { case Some(v) => v }.headOption.map { _ =>
      wrapped.bind(data).right.map(Some(_))
    }.getOrElse {
      Right(None)
    }.right.flatMap(applyConstraints)
  }

  /**
   * Unbinds this field, i.e. transforms a concrete value to plain data.
   *
   * @param value the value to unbind
   * @return the plain data
   */
  def unbind(value: Option[T]): Map[String, String] = {
    value.map(wrapped.unbind).getOrElse(Map.empty)
  }

  /**
   * Unbinds this field, i.e. transforms a concrete value to plain data, and applies validation.
   *
   * @param value the value to unbind
   * @return the plain data and any errors in the plain data
   */
  def unbindAndValidate(value: Option[T]): (Map[String, String], Seq[FormError]) = {
    val errors = collectErrors(value)
    value.map(wrapped.unbindAndValidate).map(r => r._1 -> (r._2 ++ errors)).getOrElse(Map.empty -> errors)
  }

  /**
   * Constructs a new Mapping based on this one, adding a prefix to the key.
   *
   * @param prefix the prefix to add to the key
   * @return the same mapping, with only the key changed
   */
  def withPrefix(prefix: String): Mapping[Option[T]] = {
    copy(wrapped = wrapped.withPrefix(prefix))
  }

  /** Sub-mappings (these can be seen as sub-keys). */
  val mappings: Seq[Mapping[_]] = wrapped.mappings

}
