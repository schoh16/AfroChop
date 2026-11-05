import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';
import { isEmail } from 'class-validator';
import twilio from 'twilio';

type ApplicationAlert = {
  id: string;
  submittedAt: Date;
};

@Injectable()
export class StaffApplicationNotificationService {
  private readonly logger = new Logger(
    StaffApplicationNotificationService.name,
  );

  constructor(private readonly config: ConfigService) {}

  async notifySubmitted(application: ApplicationAlert): Promise<void> {
    const body = [
      'AfroChop: A cook application needs staff review.',
      `Reference: ${application.id}`,
      `Submitted: ${application.submittedAt.toISOString()}`,
      'Use the staff-only application queue to arrange the visit. The home address is available only through authorised staff access.',
    ].join('\n');

    const results = await Promise.allSettled([
      this.sendEmails(application.id, body),
      this.sendTexts(application.id),
    ]);
    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        this.logFailure(
          index === 0 ? 'email' : 'SMS',
          application.id,
          0,
          result.reason,
        );
      }
    });
  }

  private recipients(key: string) {
    return [
      ...new Set(
        (this.config.get<string>(key) ?? '')
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean),
      ),
    ];
  }

  private async sendEmails(applicationId: string, body: string) {
    const recipients = this.recipients('STAFF_APPLICATION_EMAILS');
    const from = this.config.get<string>('STAFF_ALERTS_FROM_EMAIL')?.trim();
    const region = this.config.get<string>('AWS_REGION')?.trim();
    if (!recipients.length || !from || !region) {
      this.logger.warn(
        `Staff email alert not sent for application ${applicationId}: configure STAFF_APPLICATION_EMAILS, STAFF_ALERTS_FROM_EMAIL and AWS_REGION.`,
      );
      return;
    }
    if (!isEmail(from) || recipients.some((recipient) => !isEmail(recipient))) {
      this.logger.error(
        `Staff email alert not sent for application ${applicationId}: invalid sender or staff email configuration.`,
      );
      return;
    }

    const client = new SESv2Client({
      region,
      maxAttempts: 3,
      requestHandler: { connectionTimeout: 5_000, requestTimeout: 10_000 },
    });
    try {
      await Promise.all(
        recipients.map(async (recipient, index) => {
          try {
            await client.send(
              new SendEmailCommand({
                FromEmailAddress: from,
                Destination: { ToAddresses: [recipient] },
                Content: {
                  Simple: {
                    Subject: {
                      Data: 'AfroChop: New cook application',
                      Charset: 'UTF-8',
                    },
                    Body: { Text: { Data: body, Charset: 'UTF-8' } },
                  },
                },
              }),
            );
            this.logger.log(
              `Staff email alert accepted by SES for application ${applicationId}, recipient ${index + 1}.`,
            );
          } catch (error) {
            this.logFailure('email', applicationId, index, error);
          }
        }),
      );
    } finally {
      client.destroy();
    }
  }

  private async sendTexts(applicationId: string) {
    const recipients = this.recipients('STAFF_APPLICATION_SMS_NUMBERS');
    const accountSid = this.config.get<string>('TWILIO_ACCOUNT_SID');
    const authToken = this.config.get<string>('TWILIO_AUTH_TOKEN');
    const messagingServiceSid = this.config.get<string>(
      'TWILIO_MESSAGING_SERVICE_SID',
    );
    if (
      !recipients.length ||
      !accountSid ||
      !authToken ||
      !messagingServiceSid
    ) {
      this.logger.warn(
        `Staff SMS alert not sent for application ${applicationId}: configure staff SMS recipients and Twilio messaging credentials.`,
      );
      return;
    }
    if (recipients.some((recipient) => !/^\+[1-9]\d{7,14}$/.test(recipient))) {
      this.logger.error(
        `Staff SMS alert not sent for application ${applicationId}: staff phone numbers must use E.164 format.`,
      );
      return;
    }

    try {
      const client = twilio(accountSid, authToken, { timeout: 10_000 });
      await Promise.all(
        recipients.map(async (recipient, index) => {
          try {
            await client.messages.create({
              messagingServiceSid,
              to: recipient,
              body: `AfroChop: New cook application ${applicationId}. Check the staff application queue to arrange a visit. Reply STOP to opt out.`,
            });
            this.logger.log(
              `Staff SMS alert accepted by Twilio for application ${applicationId}, recipient ${index + 1}.`,
            );
          } catch (error) {
            this.logFailure('SMS', applicationId, index, error);
          }
        }),
      );
    } catch (error) {
      this.logFailure('SMS configuration', applicationId, 0, error);
    }
  }

  private logFailure(
    channel: string,
    applicationId: string,
    index: number,
    error: unknown,
  ) {
    const code =
      error &&
      typeof error === 'object' &&
      'code' in error &&
      typeof error.code === 'number'
        ? ` code=${error.code}`
        : '';
    this.logger.error(
      `Staff ${channel} alert failed for application ${applicationId}, recipient ${index + 1}.${code} Check provider configuration and the staff application queue.`,
    );
  }
}
