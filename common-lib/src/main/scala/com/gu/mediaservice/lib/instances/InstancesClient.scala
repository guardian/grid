package com.gu.mediaservice.lib.instances

import com.gu.mediaservice.lib.config.CommonConfig
import play.api.libs.ws.WSClient

class InstancesClient(val config: CommonConfig, val wsClient: WSClient) extends Instances
