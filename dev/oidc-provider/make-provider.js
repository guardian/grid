import { Provider } from "oidc-provider";

export const makeProvider = (
  issuer,
  oidcClientId,
  oidcClientSecret,
  redirectURI,
  findAccount
) => {
  return new Provider(issuer, {
    clients: [
      {
        client_id: oidcClientId,
        client_secret: oidcClientSecret,
        redirect_uris: [redirectURI],
      },
    ],
    claims: {
      openid: [
        "sub",
        "email",
        "email_verified",
        "given_name",
        "family_name",
        "name",
      ],
    },
    proxy: true,
    pkce: {
      required: () => false,
    },
    findAccount,
  });
};

