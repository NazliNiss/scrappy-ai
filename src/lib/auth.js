export const SESSION_COOKIE = 'scrappy_session';
const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

const DEFAULT_AUTH_USERNAME = 'admin';
const DEFAULT_AUTH_PASSWORD = '1989';
const DEFAULT_AUTH_SECRET = 'scrappy-local-dev-secret';

function getAuthSecret() {
  return process.env.AUTH_SECRET || DEFAULT_AUTH_SECRET;
}

function getAuthUsername() {
  return process.env.AUTH_USERNAME || DEFAULT_AUTH_USERNAME;
}

function getAuthPassword() {
  return process.env.AUTH_PASSWORD || DEFAULT_AUTH_PASSWORD;
}

function safeCompare(input, expected) {
  if (!expected || typeof input !== 'string') {
    return false;
  }

  if (input.length !== expected.length) {
    return false;
  }

  let mismatch = 0;
  for (let index = 0; index < expected.length; index += 1) {
    mismatch |= input.charCodeAt(index) ^ expected.charCodeAt(index);
  }

  return mismatch === 0;
}

export function isAuthConfigured() {
  return Boolean(getAuthSecret() && getAuthUsername() && getAuthPassword());
}

export function isAuthEnforced() {
  if (process.env.NODE_ENV === 'production') {
    return true;
  }

  return isAuthConfigured();
}

function base64UrlEncode(bytes) {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlDecode(value) {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  const padLength = (4 - (padded.length % 4)) % 4;
  const binary = atob(padded + '='.repeat(padLength));
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

async function importHmacKey(secret) {
  const encoder = new TextEncoder();

  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

async function signPayload(payload, secret) {
  const encoder = new TextEncoder();
  const key = await importHmacKey(secret);
  const payloadBytes = encoder.encode(JSON.stringify(payload));
  const signature = await crypto.subtle.sign('HMAC', key, payloadBytes);

  return `${base64UrlEncode(payloadBytes)}.${base64UrlEncode(new Uint8Array(signature))}`;
}

async function verifySignedPayload(token, secret) {
  const [encodedPayload, encodedSignature] = token.split('.');

  if (!encodedPayload || !encodedSignature) {
    return null;
  }

  const payloadBytes = base64UrlDecode(encodedPayload);
  const signatureBytes = base64UrlDecode(encodedSignature);
  const key = await importHmacKey(secret);
  const isValid = await crypto.subtle.verify('HMAC', key, signatureBytes, payloadBytes);

  if (!isValid) {
    return null;
  }

  const payload = JSON.parse(new TextDecoder().decode(payloadBytes));

  if (!payload?.exp || Date.now() > payload.exp) {
    return null;
  }

  return payload;
}

export async function createSessionToken() {
  const secret = getAuthSecret();

  if (!secret) {
    throw new Error('AUTH_SECRET is not configured.');
  }

  return signPayload(
    { exp: Date.now() + SESSION_DURATION_MS },
    secret
  );
}

export async function verifySessionToken(token) {
  const secret = getAuthSecret();

  if (!token || !secret) {
    return false;
  }

  try {
    const payload = await verifySignedPayload(token, secret);
    return Boolean(payload);
  } catch {
    return false;
  }
}

export function verifyCredentials(username, password) {
  return (
    safeCompare(username, getAuthUsername()) &&
    safeCompare(password, getAuthPassword())
  );
}

export function getSessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_DURATION_MS / 1000,
  };
}

export const PUBLIC_PATHS = ['/login', '/api/auth/login'];

export function isPublicPath(pathname) {
  return PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}
