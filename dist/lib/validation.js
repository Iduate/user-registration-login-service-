import { z } from 'zod';
const passwordPolicy = z
    .string()
    .min(12)
    .max(128)
    .refine((val) => /[a-z]/.test(val), { message: 'password_missing_lowercase' })
    .refine((val) => /[A-Z]/.test(val), { message: 'password_missing_uppercase' })
    .refine((val) => /\d/.test(val), { message: 'password_missing_number' })
    .refine((val) => /[^a-zA-Z0-9]/.test(val), { message: 'password_missing_symbol' })
    .refine((val) => !COMMON_PASSWORDS.has(val.toLowerCase()), {
    message: 'password_too_common'
});
const COMMON_PASSWORDS = new Set(['password123', '123456', 'qwerty', 'letmein', 'admin']);
const registerSchema = z.object({
    email: z
        .string()
        .email()
        .transform((val) => val.trim().toLowerCase())
        .refine((val) => val.length <= 254, { message: 'email_too_long' }),
    password: passwordPolicy,
    name: z.string().min(1).max(120).transform((val) => val.trim())
});
const loginSchema = z.object({
    email: z.string().email().transform((val) => val.trim().toLowerCase()),
    password: z.string().min(1).max(128)
});
const refreshSchema = z.object({
    refreshToken: z.string().min(10).max(4096)
});
export class ValidationError extends Error {
    reasons;
    constructor(reasons) {
        super('ValidationError');
        this.reasons = reasons;
    }
}
const parseOrThrow = (schema, input) => {
    const result = schema.safeParse(input);
    if (result.success) {
        return result.data;
    }
    const reasons = result.error.issues.map((issue) => issue.message);
    throw new ValidationError(reasons);
};
export const safeParseRegister = (input) => {
    return parseOrThrow(registerSchema, input);
};
export const safeParseLogin = (input) => {
    return parseOrThrow(loginSchema, input);
};
export const safeParseRefresh = (input) => {
    return parseOrThrow(refreshSchema, input);
};
