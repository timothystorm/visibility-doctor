import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { CONFIG_DIR, ensureConfigDir } from '../config/store.js';
import type { Session, StoredCookie } from '../types.js';

// ─── Key management ───────────────────────────────────────────────────────────
// A random 32-byte AES key is generated once per machine and stored at
// ~/.config/vis-doc/.secret  (mode 0o600 — owner read only).
// This means cookies at rest are encrypted and the key never leaves the machine.

const SECRET_FILE = path.join(CONFIG_DIR, '.secret');

function getOrCreateKey(): Buffer {
  ensureConfigDir();
  if (fs.existsSync(SECRET_FILE)) {
    return fs.readFileSync(SECRET_FILE);
  }
  const key = crypto.randomBytes(32);
  fs.writeFileSync(SECRET_FILE, key, { mode: 0o600 });
  return key;
}

// ─── AES-256-GCM helpers ──────────────────────────────────────────────────────

function encrypt(plaintext: string): string {
  const key = getOrCreateKey();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  // Layout: [16 iv][16 authTag][N encrypted]
  return Buffer.concat([iv, authTag, encrypted]).toString('base64');
}

function decrypt(ciphertext: string): string {
  const key = getOrCreateKey();
  const buf = Buffer.from(ciphertext, 'base64');
  const iv = buf.subarray(0, 16);
  const authTag = buf.subarray(16, 32);
  const encrypted = buf.subarray(32);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  return decipher.update(encrypted).toString('utf8') + decipher.final('utf8');
}

// ─── Session file path ────────────────────────────────────────────────────────
// One session file per environment under ~/.config/vis-doc/sessions/

function sessionFile(envName: string): string {
  return path.join(CONFIG_DIR, 'sessions', `${envName}.json`);
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function saveSession(envName: string, cookies: StoredCookie[]): void {
  const sessionsDir = path.join(CONFIG_DIR, 'sessions');
  fs.mkdirSync(sessionsDir, { recursive: true });

  const session: Session = {
    env: envName,
    cookies,
    capturedAt: Date.now(),
  };

  const encrypted = encrypt(JSON.stringify(session));
  fs.writeFileSync(sessionFile(envName), encrypted, { mode: 0o600, encoding: 'utf8' });
}

export function loadSession(envName: string): Session | null {
  const file = sessionFile(envName);
  if (!fs.existsSync(file)) return null;

  try {
    const raw = fs.readFileSync(file, 'utf8');
    return JSON.parse(decrypt(raw)) as Session;
  } catch {
    // Corrupted or key mismatch — treat as no session
    return null;
  }
}

export function clearSession(envName: string): void {
  const file = sessionFile(envName);
  if (fs.existsSync(file)) fs.unlinkSync(file);
}

export function sessionAge(session: Session): { hours: number; minutes: number } {
  const ms = Date.now() - session.capturedAt;
  const totalMinutes = Math.floor(ms / 60_000);
  return { hours: Math.floor(totalMinutes / 60), minutes: totalMinutes % 60 };
}
