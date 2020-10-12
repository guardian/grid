// inspired by https://github.com/panva/node-oidc-provider-example/tree/master/03-oidc-views-accounts

const Provider = require("oidc-provider");

const { DOMAIN, EMAIL_DOMAIN, OIDC_CLIENT_ID, OIDC_CLIENT_SECRET } = process.env;

const port = 9014;
const issuer = `http://localhost:${port}`;
const redirectURI = `https://media-auth.${DOMAIN}/oauthCallback`;

async function findAccount(_, incomingEmail) {
  if (!incomingEmail.endsWith(`@${EMAIL_DOMAIN}`)) {
    console.log(`rejecting: ${incomingEmail} doesn't end with @${EMAIL_DOMAIN}`);
    return;
  }

  const users = require("/etc/grid/users.json").map(u => {
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
    client_id: OIDC_CLIENT_ID,
    client_secret: OIDC_CLIENT_SECRET,
    redirect_uris: [ redirectURI ],
  }],
  claims: {
    openid: [ "sub", "email", "email_verified", "given_name", "family_name", "name" ]
  },
  proxy: true,
  findAccount
});

oidc.listen(port);
