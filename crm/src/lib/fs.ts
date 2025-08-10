import fs from 'fs';
import path from 'path';
import { env } from './env';

export function ensureUploadDir(): string {
  const absolute = path.resolve(process.cwd(), env.uploadDir);
  if (!fs.existsSync(absolute)) {
    fs.mkdirSync(absolute, { recursive: true });
  }
  return absolute;
}

export async function ensureUploadDirAsync(): Promise<string> {
  const absolute = path.resolve(process.cwd(), env.uploadDir);
  try {
    await fs.promises.mkdir(absolute, { recursive: true });
  } catch {}
  return absolute;
}


