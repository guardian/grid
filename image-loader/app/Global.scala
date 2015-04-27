import play.api.libs.concurrent.Akka
import play.api.mvc.WithFilters
import play.api.{Application, GlobalSettings}
import play.filters.gzip.GzipFilter

import controllers.{Application => App}

import com.gu.mediaservice.lib.play.RequestLoggingFilter


object Global extends WithFilters(CorsFilter, RequestLoggingFilter, new GzipFilter) with GlobalSettings {

  override def onStart(app: Application) {
    App.keyStore.scheduleUpdates(Akka.system(app).scheduler)
  }

}
