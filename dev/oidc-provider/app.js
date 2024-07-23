// inspired by https://github.com/panva/node-oidc-provider-example/tree/master/03-oidc-views-accounts
import { Provider } from "oidc-provider";
import { findAccountFunc } from "./find-account.js";
const USER_JSON = require("/etc/grid/users.json")

const Provider = require("oidc-provider");

const { DOMAIN, EMAIL_DOMAIN, OIDC_CLIENT_ID, OIDC_CLIENT_SECRET } = process.env;

const port = 9014;
const issuer = `http://localhost:${port}`;
const redirectURI = `https://media-auth.${DOMAIN}/oauthCallback`;

const findAccount = findAccountFunc(EMAIL_DOMAIN, USER_JSON);

const oidc = new Provider(issuer, {
  clients: [{
    client_id: OIDC_CLIENT_ID,
    client_secret: OIDC_CLIENT_SECRET,
    redirect_uris: [ redirectURI ],
  }],
  claims: {
    openid: [ "sub", "email", "email_verified", "given_name", "family_name", "name" ]
  },
  proxy: true,
  pkce: {
    required: () => false
  },
  findAccount
});

oidc.listen(port);
