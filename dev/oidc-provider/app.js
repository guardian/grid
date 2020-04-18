// inspired by https://github.com/panva/node-oidc-provider-example/tree/master/03-oidc-views-accounts

const Provider = require("oidc-provider");
const accounts = require("./accounts.json");

const port = 9014;
const issuer = `http://localhost:${port}`;
const clientId = "grid-local-id";
const clientSecret = "grid-local-secret";
const redirectURI = "https://media-auth.local.dev-gutools.co.uk/oauthCallback";

async function findAccount(_, id) {
  const account = accounts.find(a => a.email === id);

  if (!account) {
    return;
  }

  return {
    accountId: id,
    async claims() {
      return account;
    }
  }
}

const oidc = new Provider(issuer, {
  clients: [{
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uris: [ redirectURI ],
  }],
  claims: {
    openid: [ "sub", "email", "email_verified", "given_name", "family_name", "name" ]
  },
  proxy: true,
  findAccount
});

oidc.listen(port);
