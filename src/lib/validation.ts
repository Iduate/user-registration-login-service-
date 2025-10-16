import { z } from 'zod';

import type { LoginInput, RefreshInput, RegisterInput } from '../types/dto.js';

const passwordPolicy = z
  .string()
  .min(12)
  .max(128)
  .refine((val: string) => /[a-z]/.test(val), { message: 'password_missing_lowercase' })
  .refine((val: string) => /[A-Z]/.test(val), { message: 'password_missing_uppercase' })
  .refine((val: string) => /\d/.test(val), { message: 'password_missing_number' })
  .refine((val: string) => /[^a-zA-Z0-9]/.test(val), { message: 'password_missing_symbol' })
  .refine((val: string) => !COMMON_PASSWORDS.has(val.toLowerCase()), {
    message: 'password_too_common'
  });

const COMMON_PASSWORDS = new Set(['password123', '123456', 'qwerty', 'letmein', 'admin']);

const registerSchema = z.object({
  email: z
    .string()
    .email()
    .transform((val: string) => val.trim().toLowerCase())
    .refine((val: string) => val.length <= 254, { message: 'email_too_long' }),
  password: passwordPolicy,
  name: z.string().min(1).max(120).transform((val: string) => val.trim())
});

const loginSchema = z.object({
  email: z.string().email().transform((val: string) => val.trim().toLowerCase()),
  password: z.string().min(1).max(128)
});

const refreshSchema = z.object({
  refreshToken: z.string().min(10).max(4096)
});

export class ValidationError extends Error {
  constructor(public readonly reasons: string[]) {
    super('ValidationError');
  }
}

const parseOrThrow = <T>(schema: z.ZodSchema<T>, input: unknown): T => {
  const result = schema.safeParse(input);
  if (result.success) {
    return result.data;
  }

  const reasons = result.error.issues.map((issue: z.ZodIssue) => issue.message);
  throw new ValidationError(reasons);
};

export const safeParseRegister = (input: unknown): RegisterInput => {
  return parseOrThrow(registerSchema, input);
};

export const safeParseLogin = (input: unknown): LoginInput => {
  return parseOrThrow(loginSchema, input);
};

export const safeParseRefresh = (input: unknown): RefreshInput => {
  return parseOrThrow(refreshSchema, input);
};
