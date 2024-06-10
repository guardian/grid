package lib

import com.gu.mediaservice.lib.logging.LogMarker
import com.gu.mediaservice.model.Instance
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
  def includeUsageGroup(group: UsageGroup, instance: Instance)(implicit logMarker: LogMarker): WithLogMarker[(UsageGroup, Instance)] = {
    val groupedContext = logMarker + ("usageGroup" -> group.grouping)
    WithLogMarker(groupedContext, (group, instance))
  }

  def unapply[T](wc: WithLogMarker[T]): Option[(LogMarker, T)] = Some(wc.logMarker -> wc.value)
}
