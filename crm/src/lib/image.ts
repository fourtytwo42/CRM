import { fileTypeFromBuffer } from 'file-type';
import sharp from 'sharp';
import path from 'path';
import fs from 'fs';
import { ensureUploadDirAsync } from './fs';

export const MAX_AVATAR_BYTES = 5 * 1024 * 1024; // 5MB

export async function processAvatarUpload(input: Buffer): Promise<{ buffer: Buffer; ext: 'png'|'webp' } | null> {
  const sniff = await fileTypeFromBuffer(input).catch(() => null);
  if (!sniff) return null;
  const allowed = ['image/png','image/jpeg','image/webp'];
  if (!allowed.includes(sniff.mime)) return null;

  // Normalize to square 256x256 and re-encode. By default sharp drops metadata unless .withMetadata() is used.
  const image = sharp(input, { failOnError: true }).rotate();
  const resized = image.resize(256, 256, { fit: 'cover', fastShrinkOnLoad: true });
  if (sniff.mime === 'image/png') {
    return { buffer: await resized.png({ compressionLevel: 8, palette: true }).toBuffer(), ext: 'png' };
  }
  return { buffer: await resized.webp({ quality: 88, effort: 4 }).toBuffer(), ext: 'webp' };
}

export async function saveAvatarBuffer(buffer: Buffer, ext: 'png' | 'webp'): Promise<{ avatarUrl: string; absolutePath: string }> {
  const uploadDir = await ensureUploadDirAsync();
  const { randomUUID } = await import('crypto');
  const safeName = `${Date.now()}-${randomUUID().replace(/-/g, '')}.${ext}`;
  const absolutePath = path.join(uploadDir, safeName);
  await fs.promises.writeFile(absolutePath, buffer);
  const avatarUrl = path.posix.join('/uploads/avatars', safeName);
  return { avatarUrl, absolutePath };
}


