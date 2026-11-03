import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, UserVerificationType } from '@prisma/client';
import { createHmac } from 'node:crypto';
import twilio from 'twilio';
import { PrismaService } from '../prisma/prisma.service.js';
import { decryptVerificationValue } from './verification-crypto.js';

const options = { maxWait: 10_000, timeout: 30_000 };

@Injectable()
export class VerificationCodeService {
  private readonly logger = new Logger(VerificationCodeService.name);
  constructor(private readonly prisma: PrismaService, private readonly config: ConfigService) {}

  private provider() {
    const sid = this.config.get<string>('TWILIO_ACCOUNT_SID');
    const token = this.config.get<string>('TWILIO_AUTH_TOKEN');
    const serviceSid = this.config.get<string>('TWILIO_VERIFY_SERVICE_SID');
    if (!sid || !token || !serviceSid) throw new ServiceUnavailableException('Verification codes are not configured. Contact support.');
    return twilio(sid, token).verify.v2.services(serviceSid);
  }

  private async contact(tx: Prisma.TransactionClient, userId: string, type: UserVerificationType) {
    if (type !== 'email' && type !== 'phone') throw new BadRequestException('Only email and phone support verification codes.');
    // Serialize contact changes and code operations on the user row.
    const user = await tx.user.update({
      where: { id: userId }, data: { updatedAt: new Date() },
      select: { email: true, phoneNumberEncrypted: true },
    });
    const to = type === 'email' ? user.email : user.phoneNumberEncrypted
      ? decryptVerificationValue(user.phoneNumberEncrypted, this.config.get<string>('VERIFICATION_ENCRYPTION_KEY'))
      : null;
    if (!to) throw new BadRequestException('Add your phone number before requesting a code.');
    const key = this.config.get<string>('VERIFICATION_ENCRYPTION_KEY');
    if (!key) throw new ServiceUnavailableException('Verification encryption key is not configured.');
    return { to, hash: createHmac('sha256', key).update(`${type}:${to}`).digest('hex') };
  }

  async send(userId: string, type: UserVerificationType) {
    const provider = this.provider();
    const reserved = await this.prisma.$transaction(async (tx) => {
      const target = await this.contact(tx, userId, type);
      const now = new Date();
      const previous = await tx.verificationChallenge.findUnique({ where: { userId_type: { userId, type } } });
      if (previous && now.getTime() - previous.lastSentAt.getTime() < 60_000) {
        throw new ConflictException('Wait 60 seconds before requesting another code.');
      }
      const sameWindow = previous && now.getTime() - previous.windowStartedAt.getTime() < 60 * 60_000;
      if (sameWindow && previous.sendCount >= 5) throw new ConflictException('Verification send limit reached. Try again in an hour.');
      const data = {
        targetHash: target.hash, providerSid: null, lastSentAt: now,
        expiresAt: new Date(now.getTime() + 10 * 60_000),
        windowStartedAt: sameWindow ? previous.windowStartedAt : now,
        sendCount: sameWindow ? previous.sendCount + 1 : 1,
        attempts: 0, consumedAt: null,
      };
      const challenge = await tx.verificationChallenge.upsert({
        where: { userId_type: { userId, type } }, create: { userId, type, ...data }, update: data,
      });
      return { ...target, challenge };
    }, options);
    try {
      const verification = await provider.verifications.create({ to: reserved.to, channel: type === 'email' ? 'email' : 'sms' });
      if (verification.status !== 'pending') throw new ServiceUnavailableException('The verification provider did not send a pending code.');
      const saved = await this.prisma.verificationChallenge.updateMany({
        where: { id: reserved.challenge.id, lastSentAt: reserved.challenge.lastSentAt, targetHash: reserved.hash },
        data: { providerSid: verification.sid },
      });
      if (saved.count !== 1) throw new ConflictException('Verification changed while sending. Request another code.');
    } catch (error) {
      if (error instanceof ConflictException || error instanceof ServiceUnavailableException) throw error;
      this.logger.error('Verification provider could not send a code.');
      throw new ServiceUnavailableException('Could not send the verification code. Try again later or contact support.');
    }
    return { sent: true, expiresAt: reserved.challenge.expiresAt };
  }

  async check(userId: string, type: UserVerificationType, code: string) {
    const provider = this.provider();
    const reserved = await this.prisma.$transaction(async (tx) => {
      const target = await this.contact(tx, userId, type);
      const challenge = await tx.verificationChallenge.findUnique({ where: { userId_type: { userId, type } } });
      if (!challenge?.providerSid) throw new NotFoundException('Request a verification code first.');
      if (challenge.consumedAt || challenge.expiresAt <= new Date() || challenge.attempts >= 5 ||
          challenge.targetHash !== target.hash) throw new ConflictException('This code expired, was used, or exceeded its attempt limit. Request another code.');
      await tx.verificationChallenge.update({ where: { id: challenge.id }, data: { attempts: { increment: 1 } } });
      return { target, challenge };
    }, options);
    let status: string;
    try {
      const verification = await provider.verificationChecks.create({ verificationSid: reserved.challenge.providerSid!, code });
      status = verification.status;
    } catch {
      this.logger.warn('Verification provider could not check a code.');
      throw new BadRequestException('The code could not be verified. It may have expired; request another code.');
    }
    if (status !== 'approved') throw new BadRequestException('Incorrect verification code.');
    return this.prisma.$transaction(async (tx) => {
      const target = await this.contact(tx, userId, type);
      if (target.hash !== reserved.target.hash) throw new ConflictException('Your contact details changed. Verify the new details.');
      const consumed = await tx.verificationChallenge.updateMany({
        where: { id: reserved.challenge.id, providerSid: reserved.challenge.providerSid, consumedAt: null, expiresAt: { gt: new Date() } },
        data: { consumedAt: new Date() },
      });
      if (consumed.count !== 1) throw new ConflictException('The verification code was already used or expired.');
      const now = new Date();
      await tx.userVerification.upsert({
        where: { userId_type: { userId, type } },
        create: { userId, type, status: 'verified', verifiedAt: now, provider: 'twilio_verify', providerReference: reserved.challenge.providerSid },
        update: { status: 'verified', verifiedAt: now, expiresAt: null, provider: 'twilio_verify', providerReference: reserved.challenge.providerSid, reviewerNotes: null },
      });
      await tx.verificationAuditLog.create({
        data: { actorId: userId, subjectId: userId, action: 'contact_code_verified', targetType: 'user_verification',
          targetId: userId, details: { type, provider: 'twilio_verify' } },
      });
      return { verified: true, type };
    }, options);
  }
}
