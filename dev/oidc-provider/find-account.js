/**
 *
 * @param {string} emailDomain
 * @param {{id:string, firstName:string, lastName:string}[]} userList
 */
export const findAccountFunc = (emailDomain, userList) => {
  /**
   *
   * @param {unknown} _
   * @param {string} incomingEmail
   * @returns
   */
  async function findAccount(_, incomingEmail) {
    if (!incomingEmail.endsWith(`@${emailDomain}`)) {
      console.log(
        `rejecting: ${incomingEmail} doesn't end with @${emailDomain}`
      );
      return;
    }

    const users = userList.map((u) => {
      return {
        ...u,
        email: `${u.id}@${emailDomain}`,
      };
    });

    const user = users.find((u) => u.email === incomingEmail);

    if (!user) {
      console.log(`rejecting: user with email ${incomingEmail} not found`);
      return;
    }

    console.log(`user verified: ${user.email}`)

    return {
      accountId: user.email,
      async claims() {
        const { id, email, firstName, lastName } = user;

        console.log('claims running', user)

        return {
          accountId:id,
          sub: id,
          email: email,
          email_verified: true,
          given_name: firstName,
          family_name: lastName,
          name: [firstName, lastName].join(" "),
        };
      },
    };
  }

  return findAccount
};
