import com.typesafe.config.ConfigValue
import controllers.Application
import play.api.Application
import scala.collection.JavaConverters._

import lib.{Config, ForceHTTPSFilter}
import play.api.{Logger, Application, GlobalSettings}
import play.api.mvc.WithFilters

object Global extends WithFilters(ForceHTTPSFilter) with GlobalSettings {

  override def beforeStart(app: Application) {

    val allAppConfig: Seq[(String, ConfigValue)] =
      Config.appConfig.underlying.entrySet.asScala.toSeq.map(entry => (entry.getKey, entry.getValue))

    Logger.info("Play app config: \n" + allAppConfig.mkString("\n"))

    Application.keyStore.update()
  }

}
