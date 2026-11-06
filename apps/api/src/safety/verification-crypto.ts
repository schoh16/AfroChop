import { ServiceUnavailableException } from '@nestjs/common';
import {
  createCipheriv,
  createDecipheriv,
  hkdfSync,
  randomBytes,
} from 'node:crypto';

export function encryptVerificationValue(
  value: string,
  encodedKey: string | undefined,
) {
  const masterKey = Buffer.from(encodedKey ?? '', 'base64');
  if (masterKey.length !== 32)
    throw new ServiceUnavailableException(
      'Verification encryption key is not configured correctly.',
    );
  const key = Buffer.from(
    hkdfSync(
      'sha256',
      masterKey,
      Buffer.from('afrochop-verification-v1'),
      Buffer.from('field-encryption'),
      32,
    ),
  );
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(value, 'utf8'),
    cipher.final(),
  ]);
  return [
    'v1',
    iv.toString('base64url'),
    cipher.getAuthTag().toString('base64url'),
    ciphertext.toString('base64url'),
  ].join('.');
}

export function decryptVerificationValue(
  encryptedValue: string,
  encodedKey: string | undefined,
) {
  const masterKey = Buffer.from(encodedKey ?? '', 'base64');
  if (masterKey.length !== 32)
    throw new ServiceUnavailableException(
      'Verification encryption key is not configured correctly.',
    );
  const [version, iv, tag, ciphertext] = encryptedValue.split('.');
  if (version !== 'v1' || !iv || !tag || !ciphertext) {
    throw new ServiceUnavailableException(
      'Stored verification data has an unsupported format.',
    );
  }
  const key = Buffer.from(
    hkdfSync(
      'sha256',
      masterKey,
      Buffer.from('afrochop-verification-v1'),
      Buffer.from('field-encryption'),
      32,
    ),
  );
  const decipher = createDecipheriv(
    'aes-256-gcm',
    key,
    Buffer.from(iv, 'base64url'),
  );
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}
