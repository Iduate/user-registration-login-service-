/// <reference types="node" />
import { Buffer } from 'node:buffer';
import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { SignJWT, jwtVerify } from 'jose';
import { log } from './logger.js';
const ACCESS_TOKEN_TTL_SECONDS = Number(process.env.ACCESS_TOKEN_TTL_SECONDS ?? 900);
const REFRESH_TOKEN_TTL_SECONDS = Number(process.env.REFRESH_TOKEN_TTL_SECONDS ?? 60 * 60 * 24 * 7);
const SECRET_CACHE_TTL_MS = Number(process.env.SECRET_CACHE_TTL_MS ?? 5 * 60 * 1000);
const secretsClient = new SecretsManagerClient({});
let cachedSecret = null;
let cachedSecretFetchedAt = 0;
const textEncoder = new TextEncoder();
const getSecretBytes = async () => {
    const rawSecret = process.env.JWT_SECRET_PLAIN;
    if (rawSecret) {
        return textEncoder.encode(rawSecret);
    }
    if (cachedSecret && Date.now() - cachedSecretFetchedAt < SECRET_CACHE_TTL_MS) {
        return cachedSecret;
    }
    const secretArn = process.env.JWT_SECRET_ARN;
    if (!secretArn) {
        throw new Error('JWT secret not configured');
    }
    const secret = await secretsClient.send(new GetSecretValueCommand({
        SecretId: secretArn
    }));
    const secretString = secret.SecretString
        ? secret.SecretString
        : secret.SecretBinary
            ? Buffer.from(secret.SecretBinary).toString('utf8')
            : null;
    if (!secretString) {
        throw new Error('Secret String is empty');
    }
    cachedSecret = textEncoder.encode(secretString);
    cachedSecretFetchedAt = Date.now();
    return cachedSecret;
};
const issuer = process.env.JWT_ISSUER ?? 'tezda-auth-service';
const audience = process.env.JWT_AUDIENCE ?? 'tezda-clients';
export const signAccessToken = async (payload) => {
    const secret = await getSecretBytes();
    const now = Math.floor(Date.now() / 1000);
    return new SignJWT({
        sub: payload.sub,
        token_use: 'access',
        email: payload.email
    })
        .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
        .setIssuedAt(now)
        .setExpirationTime(now + ACCESS_TOKEN_TTL_SECONDS)
        .setIssuer(issuer)
        .setAudience(audience)
        .sign(secret);
};
export const signRefreshToken = async (payload) => {
    const secret = await getSecretBytes();
    const now = Math.floor(Date.now() / 1000);
    return new SignJWT({
        sub: payload.sub,
        token_use: 'refresh',
        jti: payload.tokenId
    })
        .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
        .setIssuedAt(now)
        .setExpirationTime(now + REFRESH_TOKEN_TTL_SECONDS)
        .setIssuer(issuer)
        .setAudience(audience)
        .sign(secret);
};
const verifyToken = async (token) => {
    const secret = await getSecretBytes();
    try {
        const { payload } = await jwtVerify(token, secret, {
            issuer,
            audience
        });
        return payload;
    }
    catch (err) {
        log('warn', 'jwt_verify_failed', { err: err.message });
        throw err;
    }
};
export const verifyAccessToken = async (token) => {
    const payload = await verifyToken(token);
    if (payload.token_use !== 'access') {
        throw new Error('Invalid token use');
    }
    return payload;
};
export const verifyRefreshToken = async (token) => {
    const payload = await verifyToken(token);
    if (payload.token_use !== 'refresh' || !payload.jti) {
        throw new Error('Invalid refresh token');
    }
    return payload;
};
export const getRefreshTtlSeconds = () => REFRESH_TOKEN_TTL_SECONDS;
