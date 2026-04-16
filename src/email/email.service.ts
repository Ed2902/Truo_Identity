import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import SMTPTransport from 'nodemailer/lib/smtp-transport';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly enabled: boolean;
  private readonly logRecoveryCodeInDev: boolean;
  private readonly fromName: string;
  private readonly fromAddress: string;
  private readonly timeZone: string;
  private readonly transporter: nodemailer.Transporter<SMTPTransport.SentMessageInfo>;

  constructor(private readonly configService: ConfigService) {
    this.enabled = this.configService.getOrThrow<boolean>('email.enabled');
    this.logRecoveryCodeInDev = this.configService.getOrThrow<boolean>(
      'auth.passwordRecoveryLogCodeInDev',
    );
    this.fromName = this.configService.getOrThrow<string>('email.fromName');
    this.fromAddress =
      this.configService.getOrThrow<string>('email.fromAddress');
    this.timeZone = this.configService.getOrThrow<string>('app.timeZone');
    this.transporter = nodemailer.createTransport({
      host: this.configService.getOrThrow<string>('email.host'),
      port: this.configService.getOrThrow<number>('email.port'),
      secure: this.configService.getOrThrow<boolean>('email.secure'),
      auth: {
        user: this.configService.getOrThrow<string>('email.user'),
        pass: this.configService.getOrThrow<string>('email.password'),
      },
    });
  }

  async sendPasswordRecoveryCode(input: {
    email: string;
    code: string;
    expiresAt: Date;
  }) {
    const formattedExpiry = this.formatDateTime(input.expiresAt);

    if (this.enabled) {
      await this.transporter.sendMail({
        from: {
          name: this.fromName,
          address: this.fromAddress,
        },
        to: input.email,
        subject: 'Recuperacion de cuenta',
        text: [
          'Recibimos una solicitud para restablecer tu clave.',
          '',
          `Tu codigo de recuperacion es: ${input.code}`,
          `Este codigo expira el ${formattedExpiry}.`,
          '',
          'Si no solicitaste este cambio, puedes ignorar este correo.',
        ].join('\n'),
        html: [
          '<p>Recibimos una solicitud para restablecer tu clave.</p>',
          `<p><strong>Tu codigo de recuperacion es: ${input.code}</strong></p>`,
          `<p>Este codigo expira el ${formattedExpiry}.</p>`,
          '<p>Si no solicitaste este cambio, puedes ignorar este correo.</p>',
        ].join(''),
      });

      this.logger.log(`Password recovery email sent to ${input.email}`);
    }

    if (this.logRecoveryCodeInDev) {
      this.logger.log(
        `Password recovery code prepared for ${input.email}: ${input.code} (expires at ${input.expiresAt.toISOString()})`,
      );
    }
  }

  async sendPasswordChangedConfirmation(input: {
    email: string;
    changedAt: Date;
  }) {
    const formattedChangedAt = this.formatDateTime(input.changedAt);

    if (this.enabled) {
      await this.transporter.sendMail({
        from: {
          name: this.fromName,
          address: this.fromAddress,
        },
        to: input.email,
        subject: 'Tu contrasena fue cambiada',
        text: [
          'Tu contrasena fue cambiada correctamente.',
          '',
          `Fecha y hora: ${formattedChangedAt}.`,
          '',
          'Si no fuiste tu, contacta soporte de inmediato.',
        ].join('\n'),
        html: [
          '<p>Tu contrasena fue cambiada correctamente.</p>',
          `<p>Fecha y hora: <strong>${formattedChangedAt}</strong>.</p>`,
          '<p>Si no fuiste tu, contacta soporte de inmediato.</p>',
        ].join(''),
      });

      this.logger.log(`Password changed confirmation email sent to ${input.email}`);
    }
  }

  async sendAvatarValidationCompleted(input: {
    email: string;
    isVerified: boolean;
    score?: number | null;
  }) {
    const subject = input.isVerified
      ? 'Tu validacion facial fue aprobada'
      : 'Tu validacion facial no fue aprobada';
    const scoreLine =
      typeof input.score === 'number'
        ? `Puntaje obtenido: ${input.score.toFixed(3)}.`
        : null;
    const outcomeText = input.isVerified
      ? 'Tu foto fue validada correctamente y tu perfil ya aparece como verificado.'
      : 'No logramos validar tu foto con el nivel de confianza requerido. Puedes intentarlo de nuevo con una captura mas clara.';

    if (this.enabled) {
      await this.transporter.sendMail({
        from: {
          name: this.fromName,
          address: this.fromAddress,
        },
        to: input.email,
        subject,
        text: [outcomeText, scoreLine].filter(Boolean).join('\n\n'),
        html: [`<p>${outcomeText}</p>`, scoreLine ? `<p>${scoreLine}</p>` : ''].join(''),
      });

      this.logger.log(`Avatar validation result email sent to ${input.email}`);
    }
  }

  async sendAvatarProcessingFailed(input: {
    email: string;
    stage: 'vector' | 'validation';
    reason?: string | null;
  }) {
    const stageLabel =
      input.stage === 'vector' ? 'procesar tu foto de perfil' : 'analizar tu validacion facial';
    const message = [
      `No pudimos ${stageLabel} en este momento.`,
      input.reason ? `Detalle tecnico: ${input.reason}.` : null,
      'Puedes intentarlo de nuevo en unos minutos.',
    ]
      .filter(Boolean)
      .join(' ');

    if (this.enabled) {
      await this.transporter.sendMail({
        from: {
          name: this.fromName,
          address: this.fromAddress,
        },
        to: input.email,
        subject: 'No pudimos completar tu analisis facial',
        text: message,
        html: `<p>${message}</p>`,
      });

      this.logger.log(`Avatar processing failure email sent to ${input.email}`);
    }
  }

  private formatDateTime(value: Date) {
    return new Intl.DateTimeFormat('es-CO', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: this.timeZone,
    }).format(value);
  }
}
