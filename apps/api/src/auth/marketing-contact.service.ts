import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createDecipheriv, createSign, hkdfSync } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service.js';

const optInCountryCodes = new Set([
  'AD', 'AL', 'AM', 'AT', 'AZ', 'BA', 'BE', 'BG', 'BY', 'CA', 'CH', 'CY',
  'CZ', 'DE', 'DK', 'EE', 'ES', 'FI', 'FR', 'GB', 'GE', 'GR', 'HR', 'HU',
  'IE', 'IS', 'IT', 'KZ', 'LI', 'LT', 'LU', 'LV', 'MC', 'MD', 'ME', 'MK',
  'MT', 'NL', 'NO', 'PL', 'PT', 'RO', 'RS', 'RU', 'SE', 'SI', 'SK', 'SM',
  'TR', 'UA', 'VA', 'XK',
]);
const supportedCountryCodes = new Set([
  ...optInCountryCodes,
  'US',
]);

type GoogleTokenResponse = { access_token?: unknown; expires_in?: unknown };
type GoogleValuesResponse = { values?: unknown[][] };

@Injectable()
export class MarketingContactService {
  private readonly logger = new Logger(MarketingContactService.name);
  private tokenCache: { accessToken: string; expiresAt: number } | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async setPreference(
    userId: string,
    countryCode: string,
    requestedSharing: boolean,
    explicitConsent: boolean,
  ) {
    const normalizedCountryCode = countryCode.trim().toUpperCase();
    if (!supportedCountryCodes.has(normalizedCountryCode)) {
      throw new BadRequestException('Choose a supported country before setting your contact preference.');
    }
    const requiresOptIn = optInCountryCodes.has(normalizedCountryCode);
    const sharing = requestedSharing && (!requiresOptIn || explicitConsent);
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        marketingContactSharing: sharing,
        marketingCountryCode: normalizedCountryCode,
        marketingContactSharingUpdatedAt: new Date(),
      },
      select: { id: true },
    }).catch((error: unknown) => {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'P2025') {
        throw new NotFoundException('User not found.');
      }
      throw error;
    });

    try {
      const exportStatus = await this.syncContact(user.id, sharing);
      return { marketingContactSharing: sharing, exportStatus };
    } catch (error) {
      this.logger.error(
        `Google Sheets contact sync failed for user ${user.id}: ${
          error instanceof Error ? error.name : 'Unknown integration error'
        }`,
      );
      throw new BadGatewayException(
        'Your preference was saved, but the contact list could not be updated. Retry to synchronize it.',
      );
    }
  }

  async getPreference(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { chefProfile: { select: { countryCode: true } } },
    });
    if (!user) throw new NotFoundException('User not found.');
    return {
      marketingContactSharing: user.marketingContactSharing,
      marketingCountryCode: user.marketingCountryCode ?? user.chefProfile?.countryCode ?? null,
      marketingContactSharingUpdatedAt: user.marketingContactSharingUpdatedAt,
    };
  }

  private async syncContact(userId: string, shouldShare: boolean) {
    const spreadsheetId = this.config.get<string>('GOOGLE_SHEETS_SPREADSHEET_ID');
    const serviceAccountEmail = this.config.get<string>('GOOGLE_SERVICE_ACCOUNT_EMAIL');
    const privateKey = this.config.get<string>('GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY');
    if (!spreadsheetId || !serviceAccountEmail || !privateKey) {
      this.logger.warn('Google Sheets contact sync is not configured; no contact data was exported.');
      return 'not_configured' as const;
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        phoneNumberEncrypted: true,
        marketingCountryCode: true,
      },
    });
    if (!user) throw new NotFoundException('User not found.');

    const accessToken = await this.getAccessToken(serviceAccountEmail, privateKey);
    const sheetName = this.config.get<string>('GOOGLE_SHEETS_SHEET_NAME') ?? 'Contacts';
    const columnRange = `'${sheetName.replaceAll("'", "''")}'!A:A`;
    const values = await this.sheetsRequest<GoogleValuesResponse>(
      `spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(columnRange)}`,
      accessToken,
    );
    if (!values.values?.length) {
      await this.sheetsRequest(
        `spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(`'${sheetName.replaceAll("'", "''")}'!A1:G1`)}?valueInputOption=RAW`,
        accessToken,
        {
          method: 'PUT',
          body: JSON.stringify({ values: [['User ID', 'Role', 'Name', 'Email', 'Phone', 'Country', 'Updated At']] }),
        },
      );
    }
    const existingRow = values.values?.findIndex((row) => row[0] === userId) ?? -1;
    const rowRange = existingRow >= 0
      ? `'${sheetName.replaceAll("'", "''")}'!A${existingRow + 1}:G${existingRow + 1}`
      : null;

    if (!shouldShare) {
      if (rowRange) {
        await this.sheetsRequest(
          `spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(rowRange)}:clear`,
          accessToken,
          { method: 'POST', body: '{}' },
        );
      }
      return 'removed' as const;
    }

    const row = [[
      user.id,
      user.role,
      user.name,
      user.email,
      user.phoneNumberEncrypted ? this.decryptPhoneNumber(user.phoneNumberEncrypted) : '',
      user.marketingCountryCode ?? '',
      new Date().toISOString(),
    ]];
    if (rowRange) {
      await this.sheetsRequest(
        `spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(rowRange)}?valueInputOption=RAW`,
        accessToken,
        { method: 'PUT', body: JSON.stringify({ values: row }) },
      );
      return 'updated' as const;
    }

    await this.sheetsRequest(
      `spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(`'${sheetName.replaceAll("'", "''")}'!A:G`)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
      accessToken,
      { method: 'POST', body: JSON.stringify({ values: row }) },
    );
    return 'added' as const;
  }

  private async getAccessToken(serviceAccountEmail: string, configuredKey: string) {
    if (this.tokenCache && this.tokenCache.expiresAt > Date.now() + 60_000) {
      return this.tokenCache.accessToken;
    }
    const privateKey = configuredKey.replace(/\\n/g, '\n');
    const now = Math.floor(Date.now() / 1000);
    const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
    const unsigned = `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode({
      iss: serviceAccountEmail,
      scope: 'https://www.googleapis.com/auth/spreadsheets',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    })}`;
    const signer = createSign('RSA-SHA256');
    signer.update(unsigned);
    const assertion = `${unsigned}.${signer.sign(privateKey, 'base64url')}`;
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion,
      }),
    });
    if (!response.ok) throw new Error(`Google token request failed (${response.status}).`);
    const result = await response.json() as GoogleTokenResponse;
    if (typeof result.access_token !== 'string') throw new Error('Google token response was invalid.');
    const expiresIn = typeof result.expires_in === 'number' ? result.expires_in : 3600;
    this.tokenCache = { accessToken: result.access_token, expiresAt: Date.now() + expiresIn * 1000 };
    return result.access_token;
  }

  private async sheetsRequest<T = unknown>(
    path: string,
    accessToken: string,
    init: { method?: string; body?: string } = {},
  ): Promise<T> {
    const response = await fetch(`https://sheets.googleapis.com/v4/${path}`, {
      method: init.method ?? 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(init.body ? { body: init.body } : {}),
    });
    if (!response.ok) throw new Error(`Google Sheets request failed (${response.status}).`);
    if (response.status === 204) return undefined as T;
    return await response.json() as T;
  }

  private decryptPhoneNumber(encryptedValue: string) {
    const encodedKey = this.config.get<string>('VERIFICATION_ENCRYPTION_KEY');
    if (!encodedKey) throw new Error('Phone-number decryption key is not configured.');
    const masterKey = Buffer.from(encodedKey, 'base64');
    if (masterKey.length !== 32) throw new Error('Phone-number decryption key must be 32 bytes.');
    const [version, encodedIv, encodedTag, encodedCiphertext] = encryptedValue.split('.');
    if (version !== 'v1' || !encodedIv || !encodedTag || !encodedCiphertext) {
      throw new Error('Stored phone number has an unsupported encrypted format.');
    }
    const key = Buffer.from(hkdfSync(
      'sha256',
      masterKey,
      Buffer.from('afrochop-verification-v1'),
      Buffer.from('field-encryption'),
      32,
    ));
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(encodedIv, 'base64url'));
    decipher.setAuthTag(Buffer.from(encodedTag, 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(encodedCiphertext, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  }
}
