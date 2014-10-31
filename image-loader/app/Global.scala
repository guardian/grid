import play.api.libs.concurrent.Akka
import play.api.mvc.WithFilters
import play.api.{Application, GlobalSettings}

import controllers.{Application => App}

object Global extends WithFilters(CorsFilter) with GlobalSettings {

  override def onStart(app: Application) {
    App.keyStore.scheduleUpdates(Akka.system(app).scheduler)
  }

}
