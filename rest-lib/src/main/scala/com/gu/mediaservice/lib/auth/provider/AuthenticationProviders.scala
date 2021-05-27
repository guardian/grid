package com.gu.mediaservice.lib.auth.provider

case class AuthenticationProviders(
  userProvider: UserAuthenticationProvider,
  apiProvider: MachineAuthenticationProvider,
  innerServiceProvider: InnerServiceAuthenticationProvider
)
