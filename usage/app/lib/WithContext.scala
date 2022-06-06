package lib

import com.gu.mediaservice.lib.logging.LogMarker
import model.UsageGroup

class WithContext[T](val context: LogMarker, val value: T) {
  // only `value` is valid for comparison
  override def equals(o: Any): Boolean = o match {
    // if o is also a WithContext, compare the values
    case WithContext(_, oValue) => value == oValue
    // otherwise, delegate to `value`'s equals
    case oValue => value == oValue
  }

  // only `value` is valid for comparison
  override def hashCode(): Int = value.##
}

object WithContext {
  def apply[T](value: T)(implicit context: LogMarker): WithContext[T] = WithContext(context, value)
  def apply[T](context: LogMarker, value: T): WithContext[T] = new WithContext[T](context, value)
  def includeUsageGroup(group: UsageGroup)(implicit context: LogMarker): WithContext[UsageGroup] = {
    val groupedContext = context + ("usageGroup" -> group.grouping)
    WithContext(groupedContext, group)
  }

  def unapply[T](wc: WithContext[T]): Option[(LogMarker, T)] = Some(wc.context -> wc.value)
}
