const { hashPassword, verifyPassword } = require('../src/lib/crypto.js');

describe('crypto helpers', () => {
  it('hashes and verifies passwords', async () => {
    const password = 'StrongPassword1!';
    const hashed = await hashPassword(password);

    expect(hashed).not.toEqual(password);
    await expect(verifyPassword(password, hashed)).resolves.toBe(true);
    await expect(verifyPassword('WrongPassword!1', hashed)).resolves.toBe(false);
  });
});
