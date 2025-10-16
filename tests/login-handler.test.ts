const cryptoLib = require('../src/lib/crypto.js');

jest.mock('../src/lib/db.js', () => ({
  getUserByEmail: jest.fn(),
  clearFailedLoginState: jest.fn(),
  recordFailedLogin: jest.fn(),
  storeRefreshToken: jest.fn(),
  updateLoginMeta: jest.fn(),
  deleteRefreshToken: jest.fn(),
  isUserLockedOut: jest.fn()
}));

jest.mock('../src/lib/jwt.js', () => ({
  signAccessToken: jest.fn().mockResolvedValue('access-token'),
  signRefreshToken: jest.fn().mockResolvedValue('refresh-token'),
  getRefreshTtlSeconds: jest.fn().mockReturnValue(60)
}));

jest.mock('../src/lib/logger.js', () => ({
  log: jest.fn(),
  logMetric: jest.fn()
}));

// Get the mocked db module
const dbModule = jest.requireMock('../src/lib/db.js');

describe('login handler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  jest.spyOn(cryptoLib, 'generateId').mockReturnValue('refresh-id');
  jest.spyOn(cryptoLib, 'hashToken').mockReturnValue('hashed-token');
  jest.spyOn(cryptoLib, 'verifyPassword').mockResolvedValue(true);
  });

  it('issues tokens when credentials are valid', async () => {
    const { login } = require('../src/handlers/auth.js');
    dbModule.getUserByEmail.mockResolvedValue({
      email: 'user@example.com',
      password_hash: 'stored-hash',
      failedLoginCount: 0
    } as any);
    dbModule.isUserLockedOut.mockReturnValue(false);

    const event = {
      body: JSON.stringify({ email: 'user@example.com', password: 'StrongPassword1!' })
    } as any;

      const result = await (login as unknown as (e: any, c: any, cb: any) => Promise<any>)(
        event,
        {} as any,
        jest.fn()
      );
    expect(result.statusCode).toBe(200);

    const body = JSON.parse(result.body);
    expect(body).toEqual({ accessToken: 'access-token', refreshToken: 'refresh-token' });

    expect(dbModule.storeRefreshToken).toHaveBeenCalledWith(
      'user@example.com',
      'refresh-id',
      'hashed-token',
      60
    );
    expect(dbModule.updateLoginMeta).toHaveBeenCalled();
  });
});
