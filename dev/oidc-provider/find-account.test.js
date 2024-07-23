import { findAccountFunc } from "./find-account";

const testUsers = [
  {
    firstName: "CP",
    lastName: "Scott",
    id: "cp-scott",
  },
];

describe(findAccountFunc.name, () => {
  it("return undefined for wrong domain", async () => {
    const findAccount = findAccountFunc("example.com", testUsers);
    const wrongDomain = await findAccount({}, "cp-scott@@foo.org");
    expect(wrongDomain).toBe(undefined);
  });
  it("return undefined for unknown email", async () => {
    const findAccount = findAccountFunc("example.com", testUsers);
    const noUser = await findAccount({}, "nobody@example.com");
    expect(noUser).toBe(undefined);
  });
  it("returns a user for known email", async () => {
    const findAccount = findAccountFunc("example.com", testUsers);
    const validUser = await findAccount({}, "cp-scott@example.com");
    expect(validUser.accountId).toBe("cp-scott@example.com");
  });
});
