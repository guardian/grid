// inspired by https://github.com/panva/node-oidc-provider-example/tree/master/03-oidc-views-accounts
import { findAccountFunc } from "./find-account.js";
import { makeProvider } from "./make-provider.js";
// relative path to the users file within the localstack box ( to /etc/grid/users.json)
import USER_JSON from "../../../etc/grid/users.json" assert { type: "json" };

const { DOMAIN, EMAIL_DOMAIN, OIDC_CLIENT_ID, OIDC_CLIENT_SECRET } =
  process.env;

console.log({
  DOMAIN,
  EMAIL_DOMAIN,
  OIDC_CLIENT_ID,
  OIDC_CLIENT_SECRET,
});

const port = 9014;
const issuer = `http://localhost:${port}`;
const redirectURI = `https://media-auth.${DOMAIN}/oauthCallback`;

const findAccount = findAccountFunc(EMAIL_DOMAIN, USER_JSON);

const oidc = makeProvider(
  issuer,
  OIDC_CLIENT_ID,
  OIDC_CLIENT_SECRET,
  redirectURI,
  findAccount
);

oidc.listen(port, () => {
  console.log(`local oidc provider listening: ${issuer}`);
});
