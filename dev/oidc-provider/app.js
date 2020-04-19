// inspired by https://github.com/panva/node-oidc-provider-example/tree/master/03-oidc-views-accounts

const Provider = require("oidc-provider");

const { EMAIL_DOMAIN } = process.env;

const port = 9014;
const issuer = `http://localhost:${port}`;
const clientId = "grid-local-id";
const clientSecret = "grid-local-secret";
const redirectURI = "https://media-auth.local.dev-gutools.co.uk/oauthCallback";

async function findAccount(_, incomingEmail) {
  if (!incomingEmail.endsWith(`@${EMAIL_DOMAIN}`)) {
    console.log(`rejecting: ${incomingEmail} doesn't end with @${EMAIL_DOMAIN}`);
    return;
  }

  const users = require("/etc/gu/users.json").map(u => {
    return {
      ...u,
      email: `${u.id}@${EMAIL_DOMAIN}`
    }
  });

  const user = users.find(u => u.email === incomingEmail);

  if (!user) {
    console.log(`rejecting: user with email ${incomingEmail} not found`);
    return;
  }

  return {
    accountId: user.email,
    async claims() {
      const { id, email, firstName, lastName } = user;

      return {
        sub: id,
        email: email,
        email_verified: true,
        given_name: firstName,
        family_name: lastName,
        name: [firstName, lastName].join(" ")
      };
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
