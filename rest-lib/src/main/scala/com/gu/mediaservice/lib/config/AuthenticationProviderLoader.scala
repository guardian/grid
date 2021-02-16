package com.gu.mediaservice.lib.config

import com.gu.mediaservice.lib.auth.provider.{MachineAuthenticationProvider, AuthenticationProviderResources, UserAuthenticationProvider}

object ApiAuthenticationProviderLoader extends ProviderLoader[MachineAuthenticationProvider, AuthenticationProviderResources]("api authentication provider")
object UserAuthenticationProviderLoader extends ProviderLoader[UserAuthenticationProvider, AuthenticationProviderResources]("user authentication provider")
