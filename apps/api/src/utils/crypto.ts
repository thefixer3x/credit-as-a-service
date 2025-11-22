import bcrypt from 'bcryptjs';
import jwt, { Secret, SignOptions } from 'jsonwebtoken';
import crypto from 'crypto';

const JWT_SECRET: Secret = (process.env.JWT_SECRET || 'your-super-secret-jwt-key') as Secret;
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex');
const ENCRYPTION_IV_LENGTH = 16;

// Password hashing
export async function hashPassword(password: string): Promise<string> {
  const saltRounds = 12;
  return bcrypt.hash(password, saltRounds);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// JWT tokens
export interface JwtPayload {
  userId: string;
  email: string;
  role: string;
  sessionId?: string;
}

export function generateToken(payload: JwtPayload, expiresIn: string | number = '24h'): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn } as SignOptions);
}

export function verifyToken(token: string): JwtPayload {
  try {
    return jwt.verify(token, JWT_SECRET) as JwtPayload;
  } catch (error) {
    throw new Error('Invalid or expired token');
  }
}

export function generateRefreshToken(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

// API Key generation
export function generateApiKey(): { key: string; keyHash: string; keyPrefix: string } {
  const key = `caas_${crypto.randomBytes(32).toString('hex')}`;
  const keyPrefix = key.substring(0, 10);
  const keyHash = crypto.createHash('sha256').update(key).digest('hex');
  
  return { key, keyHash, keyPrefix };
}

export function hashApiKey(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex');
}

// Data encryption (for sensitive data like SSN)
export function encrypt(text: string): string {
  const iv = crypto.randomBytes(ENCRYPTION_IV_LENGTH);
  const cipher = crypto.createCipher('aes-256-cbc', ENCRYPTION_KEY);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

export function decrypt(text: string): string {
  const parts = text.split(':');
  const iv = Buffer.from(parts[0], 'hex');
  const encryptedData = parts[1];
  const decipher = crypto.createDecipher('aes-256-cbc', ENCRYPTION_KEY);
  let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

// Session management
export function generateSessionId(): string {
  return crypto.randomBytes(32).toString('hex');
}

// Request ID generation
export function generateRequestId(): string {
  return `req_${crypto.randomBytes(16).toString('hex')}`;
}