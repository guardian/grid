import { Provider } from "oidc-provider";

export const makeProvider = (
  issuer,
  OIDC_CLIENT_ID,
  OIDC_CLIENT_SECRET,
  redirectURI,
  findAccount
) => {
  return new Provider(issuer, {
    clients: [
      {
        client_id: OIDC_CLIENT_ID,
        client_secret: OIDC_CLIENT_SECRET,
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
