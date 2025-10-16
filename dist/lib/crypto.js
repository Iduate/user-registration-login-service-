import bcrypt from 'bcryptjs';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
const SALT_ROUNDS = 12;
export const hashPassword = async (password) => {
    return bcrypt.hash(password, SALT_ROUNDS);
};
export const verifyPassword = async (candidate, hash) => {
    return bcrypt.compare(candidate, hash);
};
export const generateId = (bytes = 16) => {
    return randomBytes(bytes).toString('hex');
};
export const hashToken = (token) => {
    return createHash('sha256').update(token).digest('hex');
};
export const constantTimeEquals = (a, b) => {
    const aBuf = Buffer.from(a, 'utf8');
    const bBuf = Buffer.from(b, 'utf8');
    if (aBuf.length !== bBuf.length) {
        return false;
    }
    return timingSafeEqual(aBuf, bBuf);
};
