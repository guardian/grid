package com.gu.mediaservice.lib.elasticsearch

import com.gu.mediaservice.lib.logging.{LogMarker, MarkerMap}
import com.sksamuel.elastic4s.ElasticError
import net.logstash.logback.marker.LogstashMarker

trait ElasticSearchError {
  self: Throwable =>
  def error: ElasticError

  def markerContents: Map[String, Any]
}

object ElasticSearchException {
  def apply(e: ElasticError): Exception with ElasticSearchError = {
    e match {
      case ElasticError(t, r, _, _, _, Seq(), None, _, _, _) => // No root causes provided.
        new Exception(s"query failed because: $r type: $t") with ElasticSearchError {
          override def error: ElasticError = e

          override def markerContents: Map[String, Any] = Map("reason" -> r, "type" -> t)
        }
      case ElasticError(t, r, _, _, _, Seq(), Some(c), _, _, _) =>
        new Exception(s"query failed because: $r type: $t caused by $c") with ElasticSearchError {
          override def error: ElasticError = e

          override def markerContents: Map[String, Any] = Map("reason" -> r, "type" -> t, "causedBy" -> c.toString())
        }
      case ElasticError(t, r, _, _, _, s, None, _, _, _) =>
        new Exception(s"query failed because: $r type: $t root cause ${s.mkString(", ")}") with ElasticSearchError {
          override def error: ElasticError = e

          override def markerContents: Map[String, Any] = Map("reason" -> r, "type" -> t, "rootCause" -> s.mkString(", "))
        }
      case ElasticError(t, r, _, _, _, s, Some(c), _, _, _) =>
        new Exception(s"query failed because: $r type: $t root cause ${s.mkString(", ")}, caused by $c") with ElasticSearchError {
          override def error: ElasticError = e

          override def markerContents: Map[String, Any] = Map("reason" -> r, "type" -> t, "rootCause" -> s.mkString(", "), "causedBy" -> c.toString())
        }
      case _ => new Exception(s"query failed because: unknown error") with ElasticSearchError {
        override def error: ElasticError = e

        override def markerContents: Map[String, Any] = Map("reason" -> "unknown Elastic Search error")
      }
    }
  }

  def unapply(arg: ElasticSearchError): Option[(ElasticError, LogMarker)] = Some((arg.error, MarkerMap(arg.markerContents)))
}

case object ElasticNotFoundException extends Exception(s"Elastic Search Document Not Found")
