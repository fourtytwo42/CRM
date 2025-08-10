import { SignJWT, jwtVerify, JWTPayload } from 'jose';
import { env } from './env';

function getKey(): Uint8Array {
  // Fail fast in production if JWT secret is not configured
  if (process.env.NODE_ENV === 'production' && env.jwtSecret === 'dev-secret-change-me') {
    throw new Error('JWT_SECRET_NOT_SET');
  }
  return new TextEncoder().encode(env.jwtSecret);
}

export type AccessTokenClaims = JWTPayload & {
  sub: string;
  username: string;
  role: 'admin' | 'power' | 'user';
  status: 'active' | 'suspended' | 'banned';
  ver: number;
  jti: string;
};

export async function createAccessToken(claims: AccessTokenClaims): Promise<string> {
  const key = getKey();
  const expSeconds = env.accessTokenMinutes * 60;
  return await new SignJWT(claims)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${expSeconds}s`)
    .sign(key);
}

export async function verifyAccessToken(token: string): Promise<AccessTokenClaims> {
  const key = getKey();
  const { payload } = await jwtVerify(token, key, { algorithms: ['HS256'] });
  return payload as AccessTokenClaims;
}


