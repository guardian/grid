Authentication and authorisation providers
==========================================

Authentication and authorisation allow the Grid to identify who is using it and what they are allowed to do.

Overview
--------

### Authentication

We distinguish between three types of identity:

1. internal machine users represented by an `InnerServicePrincipal` (calls originated from internal Grid service to another, e.g. `thrall` calling `media-api`)
2. external machine users represented by a `MachinePrincipal` (automated ingest, batch processing etc. done by another
  application)
3. human users represented by a `UserPrincipal` (people directly using the Grid via the UI).

These three types of users are usually be identified using a different strategy:

1. the internal machine users are identified by the presence of a signature header (this signature is generated from a UUID and timestamp and signed using the shared Play secret) and carries the identity of the originating service and any intermediate services. 

The mechanism for handling the other two types of user is pluggable, for example, at the Guardian:

2. we identify external machine users by an API key in the header of an API request
3. human users are typically identified by looking for a cookie that a user has in their browser. If they don't have the cookie, or the cookie is out of date, then we require them to authenticate in order to obtain a valid cookie before they can continue using the Grid.

In all cases, the Grid can make further inter-microservice calls. In order to support this a mechanism is provided to call
other services on behalf of a principal.

### Authorisation

_**Note:** Authorisation is currently a work in progress so this sketches out the current thinking only._

When the Grid receives certain API requests it decides whether the principal making the request has permission to do so.
The data which is used to make this decision can come from the principal itself, from an external source of data or a
combination of the two.

This is essentially a function of `(Principal, Action) => Boolean`. `Action` can be a simple permission or it can have a
parameter (such as image attributes such as `uploadedBy` or `organisation`) allowing images to be visible to only
subsets of users.

Any `Principal` (human or machine) has an `identity` (such as an email address) and an `attributes` field. The latter is
a `TypedMap` which can be used to encapsulate any permission data obtained during the authentication process. This
permission data can then be used in the function implemented.

## Implementation

### Authentication

There are separate providers for user and external machine authentication which are configured using
`authentication.providers.user` and `authentication.providers.machine` respectfully. The provider configured at
`authentication.providers.user` must implement `UserAuthenticationProvider` and that configured for
`authentication.providers.machine` must implement `MachineAuthenticationProvider`.

Both providers follow a similar shape, although the user authentication is more complicated due to the additional
support for logging a user in if they are not currently authenticated.

Both traits can be found in
[AuthenticationProvider.scala](https://github.com/guardian/grid/blob/main/common-lib/src/main/scala/com/gu/mediaservice/lib/auth/provider/AuthenticationProvider.scala)
which will have the most up-to-date documentation. You should read the following documentation as a companion to the
scala doc.

#### UserAuthenticationProvider

There are a small number of anticipated user providers (in production we'd expect installations to use one of the last
two options):

* No-auth - we'll likely implement a no-op auth provider for the purpose of demonstrating the Grid via docker
* Basic authentication - we might also implement a very simple basic auth provider for the purpose of evaluating the
  Grid
* Federated auth - e.g. OIDC or SAML; this is similar to the original hardcoded authentication system in that a user is
  sent to a third party to authenticate and then a token is returned by the user which can then be validated by the
  authentication provider
* Proxy auth - in this case an HTTP proxy sits in front of the application, for example
  [oauth2-proxy](https://github.com/oauth2-proxy/oauth2-proxy) and authentication provider parses a header forwarded by
  the proxy service

##### Federated provider

A federated authentication provider is likely to need to implement all provider methods.

###### Example: PanDomainAuthenticationProvider

The existing `PanDomainAuthenticationProvider` uses OIDC federated authentication with a cookie that sits on the "domain
root" (note that each microservice currently sits on a separate subdomain, although it wouldn't take much effort to
change this to have a single domain and route to individual microservices using different paths on that domain).
Unfortunately the `PanDomainAuthenticationProvider` is tightly integrated into the Guardian's ecosystem so is unlikely
to be useful as anything more than a starting point.

If an unauthenticated user visits the Grid then they will be redirected to the OIDC service. They will return to a
callback endpoint which validates the token from the OIDC service and sets a cryptographically signed cookie. Subsequent
visits and API calls use the cookie to identify the user (until the cookie expires).

###### Implementation

In general a provider for a federated system will implement `authenticateRequest` to check for a value in
the [Play session](https://www.playframework.com/documentation/2.8.4/ScalaSessionFlash#Storing-data-in-the-Session)
<sup>1</sup> which avoids the need to deal with cookie signing concerns. This description assumes that this approach is
being used.

The `AuthenticationStatus` is used to signal to the Grid whether a user is authenticated (and if so, who they are) or
not. A user can fail authentication for a number of reasons but in most cases the Grid will then send the user for
authentication using the `sendForAuthentication` function. This will typically redirect a user to the federated
authentication service with appropriate parameters (including the return URL). The user's browser will then take the
user through authentication and eventually land back at the return URL on the Grid. That return URL will call the
`sendForAuthenticationCallback` function which must validate the token returned by the federated authentication service
prior to setting appropriate values in the Play session.

There are two other methods that must be implemented: the `flushToken` endpoint should remove the authentication data
from the play session and `onBehalfOf` must pass the whole cookie (with the name from the play config key
`session.cookieName`) on to the downstream requests. To achieve this you will likely want to push the cookie value into
the `attributes` map and then pull it out in much the same way as is implemented for the
`PanDomainAuthenticationProvider` described above.

<sup>1</sup> notes: for this to work you'll also need to ensure that `play.http.secret.key` is configured to be the same
across all services and `session.domain` is set to a shared domain root; whilst the session is tamper-proof, be aware
that data stored in the session is visible to the user.

##### Proxy authentication

If the Grid is behind a proxy that is handling authentication then it is likely that the provider only needs to
implement `authenticateRequest` and `onBehalfOf`. The former will extract and validate (if necessary) the HTTP header
containing the authentication token. This header will need to be stored in the `attributes` field of the user. The
latter method will simply need to add the header to outgoing requests. The remaining methods can simply be implemented
with `None`.

In the case of using proxy authentication, there is no need to run the `auth` microservice.

**Warning:** One remaining issue is how the authentication proxy deals with users who are not logged in or whose
authentication has expired. When using a federated authentication service, the Grid signals to the kahuna single page
application that the user session has expired by returning a `419` status code for any API calls. Kahuna might need to
be modified to recognise other status codes and headers as a requirement for re-authenticating the user.

#### MachineAuthenticationProvider

There are also a small number of anticipated `MachineAuthenticationProviders`:

* A no-op provider to allow easy use via the docker demo
* An API key provider (the current default with keys in an S3 bucket)
* Alternative API key providers (possibly backed by a database or using a signing mechanism rather than a plain text
  key)

In each case there are only two methods that need to be implemented. The first is the `authenticateRequest` which should
validate the appropriate HTTP header and create the MachinePrincipal as appropriate (storing the auth header in the
`attributes` map for downstream requests). Secondly it will need to implement the `onBehalfOf` method to allow
downstream calls by appending the auth header to requests.

## Implementing an authorisation provider

The authentication provider was not merged at the time of writing these docs so the documentation doesn't yet exist.
