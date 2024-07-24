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

    ttl: {
      AccessToken(ctx, token, client) {
        // return a Number (in seconds) for the given token (first argument), the associated client is
        // passed as a second argument
        // Tip: if the values are entirely client based memoize the results

        console.log("AccessToken", { ctx, token, client });

        return 60 * 60 * 24 *7; // one week - not final value, just setting for now
      },
      IdToken: 3600 /* 1 hour in seconds */,
      Interaction: 3600 /* 1 hour in seconds */,
      Session: 1209600 /* 14 days in seconds */,
    },
  });
};

/* warnings from console:
2024-07-24 09:46:55 oidc-provider NOTICE: default renderError function called, you SHOULD change it in order to customize the look of the error page.
2024-07-24 09:47:21 oidc-provider NOTICE: default ttl.Interaction function called, you SHOULD change it in order to define the expiration for Interaction artifacts.
2024-07-24 09:47:21 oidc-provider NOTICE: default ttl.Session function called, you SHOULD change it in order to define the expiration for Session artifacts.
2024-07-24 09:48:18 user verified: grid-demo-account@guardian.co.uk
2024-07-24 09:49:27 oidc-provider NOTICE: default ttl.Grant function called, you SHOULD change it in order to define the expiration for Grant artifacts.
2024-07-24 09:49:27 user verified: grid-demo-account@guardian.co.uk
2024-07-24 09:49:28 user verified: grid-demo-account@guardian.co.uk
2024-07-24 09:49:28 oidc-provider NOTICE: default ttl.AccessToken function called, you SHOULD change it in order to define the expiration for AccessToken artifacts.
2024-07-24 09:49:28 oidc-provider NOTICE: default ttl.IdToken function called, you SHOULD change it in order to define the expiration for IdToken artifacts.
2024-07-24 09:49:28 user verified: grid-demo-account@guardian.co.uk
*/
