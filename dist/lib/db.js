import process from 'node:process';
/// <reference types="node" />
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DeleteCommand, GetCommand, PutCommand, QueryCommand, UpdateCommand, DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { log } from './logger.js';
const TABLE_NAME = process.env.TABLE_NAME;
if (!TABLE_NAME) {
    throw new Error('TABLE_NAME env var is required');
}
const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client, {
    marshallOptions: { convertEmptyValues: true }
});
const userPk = (email) => `USER#${email}`;
const profileSk = 'PROFILE';
const refreshSk = (tokenId) => `REFRESH#${tokenId}`;
const LOCKOUT_THRESHOLD = Number(process.env.LOCKOUT_THRESHOLD ?? 5);
const LOCKOUT_MINUTES = Number(process.env.LOCKOUT_MINUTES ?? 15);
export const getUserByEmail = async (email) => {
    const { Item } = await docClient.send(new GetCommand({
        TableName: TABLE_NAME,
        Key: { pk: userPk(email), sk: profileSk }
    }));
    if (!Item) {
        return null;
    }
    return Item;
};
export const putUser = async (params) => {
    const nowIso = new Date().toISOString();
    try {
        await docClient.send(new PutCommand({
            TableName: TABLE_NAME,
            Item: {
                pk: userPk(params.email),
                sk: profileSk,
                email: params.email,
                name: params.name,
                password_hash: params.password_hash,
                createdAt: nowIso,
                updatedAt: nowIso,
                failedLoginCount: 0
            },
            ConditionExpression: 'attribute_not_exists(pk)'
        }));
    }
    catch (err) {
        log('error', 'put_user_failed', { err });
        throw err;
    }
};
export const updateLoginMeta = async (email, attributes) => {
    const setParts = ['updatedAt = :updatedAt'];
    const removeParts = [];
    const values = { ':updatedAt': new Date().toISOString() };
    if (attributes.lastLoginAt) {
        setParts.push('lastLoginAt = :lastLoginAt');
        values[':lastLoginAt'] = attributes.lastLoginAt;
    }
    if (typeof attributes.failedLoginCount === 'number') {
        setParts.push('failedLoginCount = :failedLoginCount');
        values[':failedLoginCount'] = attributes.failedLoginCount;
    }
    if (attributes.lockoutUntil) {
        setParts.push('lockoutUntil = :lockoutUntil');
        values[':lockoutUntil'] = attributes.lockoutUntil;
    }
    else if (attributes.lockoutUntil === null) {
        removeParts.push('lockoutUntil');
    }
    let updateExpression = '';
    if (setParts.length) {
        updateExpression += `SET ${setParts.join(', ')}`;
    }
    if (removeParts.length) {
        updateExpression += `${updateExpression ? ' ' : ''}REMOVE ${removeParts.join(', ')}`;
    }
    await docClient.send(new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { pk: userPk(email), sk: profileSk },
        UpdateExpression: updateExpression,
        ExpressionAttributeValues: values
    }));
};
export const recordFailedLogin = async (email) => {
    const nowIso = new Date().toISOString();
    const update = await docClient.send(new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { pk: userPk(email), sk: profileSk },
        UpdateExpression: 'SET failedLoginCount = if_not_exists(failedLoginCount, :zero) + :inc, lastFailedLoginAt = :now, updatedAt = :now',
        ExpressionAttributeValues: {
            ':inc': 1,
            ':zero': 0,
            ':now': nowIso
        },
        ReturnValues: 'UPDATED_NEW'
    }));
    const failedCount = Number(update.Attributes?.failedLoginCount ?? 0);
    if (failedCount >= LOCKOUT_THRESHOLD) {
        const lockoutUntil = new Date(Date.now() + LOCKOUT_MINUTES * 60_000).toISOString();
        await docClient.send(new UpdateCommand({
            TableName: TABLE_NAME,
            Key: { pk: userPk(email), sk: profileSk },
            UpdateExpression: 'SET lockoutUntil = :lockoutUntil',
            ExpressionAttributeValues: { ':lockoutUntil': lockoutUntil }
        }));
    }
};
export const clearFailedLoginState = async (email) => {
    await docClient.send(new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { pk: userPk(email), sk: profileSk },
        UpdateExpression: 'SET failedLoginCount = :zero, updatedAt = :now REMOVE lockoutUntil',
        ExpressionAttributeValues: {
            ':zero': 0,
            ':now': new Date().toISOString()
        }
    }));
};
export const isUserLockedOut = (user) => {
    if (!user.lockoutUntil) {
        return false;
    }
    return new Date(user.lockoutUntil).getTime() > Date.now();
};
export const storeRefreshToken = async (email, tokenId, tokenHash, ttlSeconds) => {
    const now = Date.now();
    const ttlEpoch = Math.floor(now / 1000) + ttlSeconds;
    await docClient.send(new PutCommand({
        TableName: TABLE_NAME,
        Item: {
            pk: userPk(email),
            sk: refreshSk(tokenId),
            tokenId,
            tokenHash,
            createdAt: new Date(now).toISOString(),
            ttl: ttlEpoch
        }
    }));
};
export const getRefreshToken = async (email, tokenId) => {
    const { Item } = await docClient.send(new GetCommand({
        TableName: TABLE_NAME,
        Key: { pk: userPk(email), sk: refreshSk(tokenId) }
    }));
    if (!Item) {
        return null;
    }
    return Item;
};
export const deleteRefreshToken = async (email, tokenId) => {
    await docClient.send(new DeleteCommand({
        TableName: TABLE_NAME,
        Key: { pk: userPk(email), sk: refreshSk(tokenId) }
    }));
};
export const listUserRefreshTokens = async (email) => {
    const result = await docClient.send(new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'pk = :pk AND begins_with(sk, :prefix)',
        ExpressionAttributeValues: {
            ':pk': userPk(email),
            ':prefix': 'REFRESH#'
        },
        ProjectionExpression: 'tokenId'
    }));
    const items = (result.Items ?? []);
    return items.map((item) => item.tokenId);
};
