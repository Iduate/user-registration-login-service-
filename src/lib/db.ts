import process from 'node:process';
/// <reference types="node" />
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DeleteCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
  DynamoDBDocumentClient
} from '@aws-sdk/lib-dynamodb';

import { log } from './logger.js';
import type { UserRecord } from '../types/dto.js';

const TABLE_NAME = process.env.TABLE_NAME;

if (!TABLE_NAME) {
  throw new Error('TABLE_NAME env var is required');
}

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: { convertEmptyValues: true }
});

const userPk = (email: string) => `USER#${email}`;
const profileSk = 'PROFILE';
const refreshSk = (tokenId: string) => `REFRESH#${tokenId}`;

const LOCKOUT_THRESHOLD = Number(process.env.LOCKOUT_THRESHOLD ?? 5);
const LOCKOUT_MINUTES = Number(process.env.LOCKOUT_MINUTES ?? 15);

export const getUserByEmail = async (email: string): Promise<UserRecord | null> => {
  const { Item } = await docClient.send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: { pk: userPk(email), sk: profileSk }
    })
  );

  if (!Item) {
    return null;
  }

  return Item as UserRecord;
};

export const putUser = async (params: {
  email: string;
  name: string;
  password_hash: string;
}): Promise<void> => {
  const nowIso = new Date().toISOString();

  try {
    await docClient.send(
      new PutCommand({
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
      })
    );
  } catch (err) {
    log('error', 'put_user_failed', { err });
    throw err;
  }
};

export const updateLoginMeta = async (
  email: string,
  attributes: Partial<{
    lastLoginAt: string;
    failedLoginCount: number;
    lockoutUntil: string | null;
  }>
): Promise<void> => {
  const setParts: string[] = ['updatedAt = :updatedAt'];
  const removeParts: string[] = [];
  const values: Record<string, unknown> = { ':updatedAt': new Date().toISOString() };

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
  } else if (attributes.lockoutUntil === null) {
    removeParts.push('lockoutUntil');
  }

  let updateExpression = '';
  if (setParts.length) {
    updateExpression += `SET ${setParts.join(', ')}`;
  }

  if (removeParts.length) {
    updateExpression += `${updateExpression ? ' ' : ''}REMOVE ${removeParts.join(', ')}`;
  }

  await docClient.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { pk: userPk(email), sk: profileSk },
      UpdateExpression: updateExpression,
      ExpressionAttributeValues: values
    })
  );
};

export const recordFailedLogin = async (email: string): Promise<void> => {
  const nowIso = new Date().toISOString();
  const update = await docClient.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { pk: userPk(email), sk: profileSk },
      UpdateExpression:
        'SET failedLoginCount = if_not_exists(failedLoginCount, :zero) + :inc, lastFailedLoginAt = :now, updatedAt = :now',
      ExpressionAttributeValues: {
        ':inc': 1,
        ':zero': 0,
        ':now': nowIso
      },
      ReturnValues: 'UPDATED_NEW'
    })
  );

  const failedCount = Number(update.Attributes?.failedLoginCount ?? 0);
  if (failedCount >= LOCKOUT_THRESHOLD) {
    const lockoutUntil = new Date(Date.now() + LOCKOUT_MINUTES * 60_000).toISOString();
    await docClient.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { pk: userPk(email), sk: profileSk },
        UpdateExpression: 'SET lockoutUntil = :lockoutUntil',
        ExpressionAttributeValues: { ':lockoutUntil': lockoutUntil }
      })
    );
  }
};

export const clearFailedLoginState = async (email: string): Promise<void> => {
  await docClient.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { pk: userPk(email), sk: profileSk },
      UpdateExpression: 'SET failedLoginCount = :zero, updatedAt = :now REMOVE lockoutUntil',
      ExpressionAttributeValues: {
        ':zero': 0,
        ':now': new Date().toISOString()
      }
    })
  );
};

export const isUserLockedOut = (user: UserRecord): boolean => {
  if (!user.lockoutUntil) {
    return false;
  }

  return new Date(user.lockoutUntil).getTime() > Date.now();
};

export const storeRefreshToken = async (
  email: string,
  tokenId: string,
  tokenHash: string,
  ttlSeconds: number
): Promise<void> => {
  const now = Date.now();
  const ttlEpoch = Math.floor(now / 1000) + ttlSeconds;

  await docClient.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        pk: userPk(email),
        sk: refreshSk(tokenId),
        tokenId,
        tokenHash,
        createdAt: new Date(now).toISOString(),
        ttl: ttlEpoch
      }
    })
  );
};

export const getRefreshToken = async (
  email: string,
  tokenId: string
): Promise<{ tokenId: string; tokenHash: string; ttl: number } | null> => {
  const { Item } = await docClient.send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: { pk: userPk(email), sk: refreshSk(tokenId) }
    })
  );

  if (!Item) {
    return null;
  }

  return Item as { tokenId: string; tokenHash: string; ttl: number };
};

export const deleteRefreshToken = async (email: string, tokenId: string): Promise<void> => {
  await docClient.send(
    new DeleteCommand({
      TableName: TABLE_NAME,
      Key: { pk: userPk(email), sk: refreshSk(tokenId) }
    })
  );
};

export const listUserRefreshTokens = async (email: string): Promise<string[]> => {
  const result = await docClient.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'pk = :pk AND begins_with(sk, :prefix)',
      ExpressionAttributeValues: {
        ':pk': userPk(email),
        ':prefix': 'REFRESH#'
      },
      ProjectionExpression: 'tokenId'
    })
  );

  const items = (result.Items ?? []) as Array<{ tokenId: string }>;
  return items.map((item) => item.tokenId);
};
