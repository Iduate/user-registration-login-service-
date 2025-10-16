import { clearFailedLoginState, getRefreshToken, getUserByEmail, putUser, recordFailedLogin, storeRefreshToken, updateLoginMeta, deleteRefreshToken, isUserLockedOut } from '../lib/db.js';
import { constantTimeEquals, generateId, hashPassword, hashToken, verifyPassword } from '../lib/crypto.js';
import { log, logMetric } from '../lib/logger.js';
import { getRefreshTtlSeconds, signAccessToken, signRefreshToken, verifyRefreshToken } from '../lib/jwt.js';
import { safeParseLogin, safeParseRefresh, safeParseRegister, ValidationError } from '../lib/validation.js';
const response = (statusCode, body) => ({
    statusCode,
    headers: {
        'Content-Type': 'application/json',
        'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload'
    },
    body: JSON.stringify(body)
});
const parseEventBody = (eventBody) => {
    if (!eventBody) {
        return {};
    }
    try {
        return JSON.parse(eventBody);
    }
    catch (err) {
        throw new ValidationError(['invalid_json']);
    }
};
export const register = async (event) => {
    const start = Date.now();
    try {
        const payload = safeParseRegister(parseEventBody(event.body));
        const existing = await getUserByEmail(payload.email);
        if (existing) {
            log('warn', 'register_conflict', { email: payload.email });
            return response(409, { message: 'User already exists' });
        }
        const passwordHash = await hashPassword(payload.password);
        await putUser({ email: payload.email, name: payload.name, password_hash: passwordHash });
        log('info', 'user_registered', { email: payload.email });
        logMetric('Registrations', 1, { Endpoint: 'register' });
        return response(201, { message: 'Registered' });
    }
    catch (err) {
        if (err instanceof ValidationError) {
            log('warn', 'register_validation_failed', { reasons: err.reasons });
            return response(400, { message: 'Invalid payload', reasons: err.reasons });
        }
        log('error', 'register_failed', { err: err.message });
        return response(500, { message: 'Registration failed' });
    }
    finally {
        logMetric('Latency', Date.now() - start, { Endpoint: 'register' });
    }
};
export const login = async (event) => {
    const start = Date.now();
    try {
        const payload = safeParseLogin(parseEventBody(event.body));
        const user = await getUserByEmail(payload.email);
        if (!user) {
            log('warn', 'login_failed_user_missing', { email: payload.email });
            return response(401, { message: 'Invalid credentials' });
        }
        if (isUserLockedOut(user)) {
            log('warn', 'login_locked_out', { email: payload.email, lockoutUntil: user.lockoutUntil });
            return response(429, { message: 'Too many attempts. Try again later.' });
        }
        const passwordValid = await verifyPassword(payload.password, user.password_hash);
        if (!passwordValid) {
            await recordFailedLogin(payload.email);
            logMetric('LoginFailures', 1, { Endpoint: 'login' });
            log('warn', 'login_failed_bad_password', { email: payload.email });
            return response(401, { message: 'Invalid credentials' });
        }
        await clearFailedLoginState(payload.email);
        const accessToken = await signAccessToken({ sub: payload.email, email: payload.email });
        const refreshTokenId = generateId(32);
        const refreshToken = await signRefreshToken({ sub: payload.email, tokenId: refreshTokenId });
        await storeRefreshToken(payload.email, refreshTokenId, hashToken(refreshToken), getRefreshTtlSeconds());
        await updateLoginMeta(payload.email, {
            lastLoginAt: new Date().toISOString(),
            failedLoginCount: 0,
            lockoutUntil: null
        });
        logMetric('LoginSuccess', 1, { Endpoint: 'login' });
        log('info', 'login_success', { email: payload.email });
        return response(200, { accessToken, refreshToken });
    }
    catch (err) {
        if (err instanceof ValidationError) {
            log('warn', 'login_validation_failed', { reasons: err.reasons });
            return response(400, { message: 'Invalid payload', reasons: err.reasons });
        }
        log('error', 'login_failed', { err: err.message });
        return response(500, { message: 'Login failed' });
    }
    finally {
        logMetric('Latency', Date.now() - start, { Endpoint: 'login' });
    }
};
export const refresh = async (event) => {
    const start = Date.now();
    try {
        const payload = safeParseRefresh(parseEventBody(event.body));
        const tokenPayload = await verifyRefreshToken(payload.refreshToken);
        const tokenRecord = await getRefreshToken(tokenPayload.sub, tokenPayload.jti);
        if (!tokenRecord) {
            log('warn', 'refresh_missing_token', { email: tokenPayload.sub });
            return response(401, { message: 'Invalid refresh token' });
        }
        const suppliedHash = hashToken(payload.refreshToken);
        if (!constantTimeEquals(tokenRecord.tokenHash, suppliedHash)) {
            log('warn', 'refresh_token_mismatch', { email: tokenPayload.sub });
            await deleteRefreshToken(tokenPayload.sub, tokenPayload.jti);
            return response(401, { message: 'Invalid refresh token' });
        }
        if (tokenRecord.ttl * 1000 < Date.now()) {
            log('warn', 'refresh_token_expired', { email: tokenPayload.sub });
            await deleteRefreshToken(tokenPayload.sub, tokenPayload.jti);
            return response(401, { message: 'Invalid refresh token' });
        }
        const newRefreshId = generateId(32);
        const accessToken = await signAccessToken({ sub: tokenPayload.sub, email: tokenPayload.sub });
        const refreshToken = await signRefreshToken({ sub: tokenPayload.sub, tokenId: newRefreshId });
        await storeRefreshToken(tokenPayload.sub, newRefreshId, hashToken(refreshToken), getRefreshTtlSeconds());
        await deleteRefreshToken(tokenPayload.sub, tokenPayload.jti);
        logMetric('TokenRefresh', 1, { Endpoint: 'token/refresh' });
        log('info', 'refresh_success', { email: tokenPayload.sub });
        return response(200, { accessToken, refreshToken });
    }
    catch (err) {
        if (err instanceof ValidationError) {
            log('warn', 'refresh_validation_failed', { reasons: err.reasons });
            return response(400, { message: 'Invalid payload', reasons: err.reasons });
        }
        log('error', 'refresh_failed', { err: err.message });
        return response(401, { message: 'Invalid refresh token' });
    }
    finally {
        logMetric('Latency', Date.now() - start, { Endpoint: 'token/refresh' });
    }
};
