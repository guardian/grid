package lib

import com.gu.mediaservice.lib.logging.LogMarker
import model.UsageGroup

class WithLogMarker[T](val logMarker: LogMarker, val value: T) {
  // only `value` is valid for comparison
  override def equals(o: Any): Boolean = o match {
    // if o is also a WithContext, compare the values
    case WithLogMarker(_, oValue) => value == oValue
    // otherwise, delegate to `value`'s equals
    case oValue => value == oValue
  }

  // only `value` is valid for comparison
  override def hashCode(): Int = value.##
}

object WithLogMarker {
  def apply[T](value: T)(implicit logMarker: LogMarker): WithLogMarker[T] = WithLogMarker(logMarker, value)
  def apply[T](logMarker: LogMarker, value: T): WithLogMarker[T] = new WithLogMarker[T](logMarker, value)
  def includeUsageGroup(group: UsageGroup)(implicit logMarker: LogMarker): WithLogMarker[UsageGroup] = {
    val groupedContext = logMarker + ("usageGroup" -> group.grouping)
    WithLogMarker(groupedContext, group)
  }

  def unapply[T](wc: WithLogMarker[T]): Option[(LogMarker, T)] = Some(wc.logMarker -> wc.value)
}
