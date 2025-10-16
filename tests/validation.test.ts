const { safeParseRegister, ValidationError } = require('../src/lib/validation.js');

describe('validation helpers', () => {
  it('normalises and validates registration payload', () => {
    const payload = {
      email: 'User@Example.com',
      password: 'StrongPassword1!',
      name: 'Example User'
    };

    const result = safeParseRegister(payload);
    expect(result.email).toBe('user@example.com');
    expect(result.name).toBe('Example User');
  });

  it('rejects weak passwords', () => {
    const payload = {
      email: 'user@example.com',
      password: 'weak',
      name: 'Example User'
    };

    expect(() => safeParseRegister(payload)).toThrow(ValidationError);
  });
});
