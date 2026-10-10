import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createDecipheriv, hkdfSync } from 'node:crypto';
import twilio from 'twilio';
import { PrismaService } from '../prisma/prisma.service.js';

export type CustomerOrderSmsStatus =
  | 'requested'
  | 'quoted'
  | 'cancelled'
  | 'completed';

@Injectable()
export class SmsNotificationService {
  private readonly logger = new Logger(SmsNotificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async notifyCustomerOrderStatus(bookingRequestId: string, status: CustomerOrderSmsStatus) {
    try {
      const booking = await this.prisma.bookingRequest.findUnique({
        where: { id: bookingRequestId },
        select: {
          id: true,
          customer: {
            select: {
              smsOrderUpdates: true,
              phoneNumberEncrypted: true,
            },
          },
        },
      });
      if (!booking?.customer.smsOrderUpdates) return;
      if (!booking.customer.phoneNumberEncrypted) {
        this.logger.warn(`SMS opted-in customer has no phone number for booking ${bookingRequestId}.`);
        return;
      }

      const accountSid = this.config.get<string>('TWILIO_ACCOUNT_SID');
      const authToken = this.config.get<string>('TWILIO_AUTH_TOKEN');
      const messagingServiceSid = this.config.get<string>('TWILIO_MESSAGING_SERVICE_SID');
      if (!accountSid || !authToken || !messagingServiceSid) {
        this.logger.warn(`Twilio is not configured; SMS update for booking ${bookingRequestId} was not sent.`);
        return;
      }

      const to = this.decryptPhoneNumber(booking.customer.phoneNumberEncrypted);
      const message = this.messageForStatus(status);
      await twilio(accountSid, authToken).messages.create({
        messagingServiceSid,
        to,
        body: message,
      });
    } catch (error) {
      const safeDetails = error instanceof Error
        ? [
            error.name,
            'code' in error && typeof error.code === 'number' ? `code=${error.code}` : null,
            'status' in error && typeof error.status === 'number' ? `status=${error.status}` : null,
          ].filter(Boolean).join(' ')
        : 'Unknown notification error.';
      this.logger.error(
        `Could not send SMS update for booking ${bookingRequestId}: ${safeDetails}`,
      );
    }
  }

  private messageForStatus(status: CustomerOrderSmsStatus) {
    const messages: Record<CustomerOrderSmsStatus, string> = {
      requested: 'AfroChop: Your quote request was sent to the cook.',
      quoted: 'AfroChop: You have a new quote. Sign in to review the details.',
      cancelled: 'AfroChop: Your order request status changed to cancelled. Sign in for details.',
      completed: 'AfroChop: Your order is marked complete. Sign in to review its details.',
    };
    return `${messages[status]} Reply STOP to opt out of text updates.`;
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
    const key = Buffer.from(
      hkdfSync(
        'sha256',
        masterKey,
        Buffer.from('afrochop-verification-v1'),
        Buffer.from('field-encryption'),
        32,
      ),
    );
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(encodedIv, 'base64url'));
    decipher.setAuthTag(Buffer.from(encodedTag, 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(encodedCiphertext, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  }
}
