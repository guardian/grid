import com.gu.mediaservice.lib.config.InstanceForRequest
import lib.KahunaConfig
import play.api.Configuration
import play.api.mvc.{EssentialAction, EssentialFilter, RequestHeader}
import play.filters.headers._

class InstanceSpecificSecurityHeaderFilter(config: KahunaConfig, playConfig: Configuration)
  extends EssentialFilter with InstanceForRequest {

  override def apply(next: EssentialAction): EssentialAction = (req: RequestHeader) => {
    val instance = instanceOf(req)
    val kahunaSecurityConfig = KahunaSecurityConfig.apply(config, playConfig, instance)
    val instanceSpecificSecurityHeadersFilter = SecurityHeadersFilter(kahunaSecurityConfig: SecurityHeadersConfig).apply(next)
    instanceSpecificSecurityHeadersFilter.apply(req)
  }

}
