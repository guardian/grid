package com.gu.mediaservice.lib.config

import akka.actor.ActorSystem
import play.api.Configuration

case class GridConfigResources(configuration: Configuration, actorSystem: ActorSystem)
