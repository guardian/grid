package com.gu.mediaservice.lib.config

import com.gu.mediaservice.model.Instance
import play.api.mvc.RequestHeader

trait InstanceForRequest {

  def instanceOf(request: RequestHeader): Instance = {
    // TODO some sort of filter supplied attribute
    Instance(request.host.split("\\.").head)
  }

}
