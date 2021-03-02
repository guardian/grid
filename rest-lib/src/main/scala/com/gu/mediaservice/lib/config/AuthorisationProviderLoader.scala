package com.gu.mediaservice.lib.config

import com.gu.mediaservice.lib.auth.provider.{AuthorisationProvider, AuthorisationProviderResources}

object AuthorisationProviderLoader extends ProviderLoader[AuthorisationProvider, AuthorisationProviderResources]("authorisation provider")
