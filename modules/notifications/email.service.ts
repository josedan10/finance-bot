// Email Notification Service

import * as nodemailer from 'nodemailer';
import { INotificationService } from './types';
import { NotificationPayload, NotificationResult, DEFAULT_THRESHOLDS } from '../../src/enums/notifications';
import logger from '../../src/lib/logger';

export class EmailNotificationService implements INotificationService {
  private transporter: nodemailer.Transporter;
  
  constructor() {
    // Create transporter using environment variables
    // For now, we'll use a placeholder - actual SMTP config would come from env
    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }

  async send(payload: NotificationPayload): Promise<NotificationResult> {
    try {
      const thresholdInfo = DEFAULT_THRESHOLDS.find(t => t.percentage === payload.threshold);
      
      const mailOptions: nodemailer.SendMailOptions = {
        from: process.env.EMAIL_FROM || '"Finance Bot" <noreply@financebot.app>',
        to: payload.userEmail,
        subject: `⚠️ Budget Alert: ${payload.categoryName} at ${payload.percentage}%`,
        html: this.buildEmailTemplate(payload, thresholdInfo),
        text: this.buildPlainTextTemplate(payload),
      };

      await this.transporter.sendMail(mailOptions);
      
      logger.info('Email notification sent', {
        userId: payload.userId,
        categoryId: payload.categoryId,
        threshold: payload.threshold,
      });

      return {
        success: true,
        channel: 'email',
      };
    } catch (error) {
      logger.error('Failed to send email notification', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId: payload.userId,
        categoryId: payload.categoryId,
      });

      return {
        success: false,
        channel: 'email',
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async isAvailable(_userId: number): Promise<boolean> {
    // Check if SMTP is configured
    return !!(process.env.SMTP_USER && process.env.SMTP_PASS);
  }

  private buildEmailTemplate(
    payload: NotificationPayload,
    thresholdInfo?: { percentage: number; label: string; color: string }
  ): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1a1a1a; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, ${thresholdInfo?.color || '#3b82f6'} 0%, ${thresholdInfo?.color || '#2563eb'} 100%); color: white; padding: 30px; border-radius: 12px 12px 0 0; text-align: center; }
          .content { background: #f9fafb; padding: 30px; border-radius: 0 0 12px 12px; }
          .alert-badge { display: inline-block; padding: 6px 12px; background: ${thresholdInfo?.color || '#ef4444'}; color: white; border-radius: 20px; font-size: 14px; font-weight: 600; margin-bottom: 15px; }
          .details { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; }
          .detail-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #eee; }
          .detail-row:last-child { border-bottom: none; }
          .detail-label { color: #666; }
          .detail-value { font-weight: 600; }
          .progress-bar { background: #e5e7eb; height: 20px; border-radius: 10px; overflow: hidden; margin-top: 10px; }
          .progress-fill { height: 100%; background: ${thresholdInfo?.color || '#ef4444'}; border-radius: 10px; }
          .button { display: inline-block; padding: 12px 24px; background: #3b82f6; color: white; text-decoration: none; border-radius: 8px; margin-top: 20px; }
          .footer { text-align: center; padding: 20px; color: #999; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1 style="margin: 0;">⚠️ Budget Alert</h1>
          </div>
          <div class="content">
            <div class="alert-badge">${thresholdInfo?.label || 'Warning'} - ${payload.threshold}%</div>
            
            <p>Hola,</p>
            <p>Tu gasto en <strong>${payload.categoryName}</strong> ha alcanzado el <strong>${payload.percentage}%</strong> de tu presupuesto.</p>
            
            <div class="details">
              <div class="detail-row">
                <span class="detail-label">Categoría</span>
                <span class="detail-value">${payload.categoryName}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">Gasto actual</span>
                <span class="detail-value">$${payload.currentSpending.toFixed(2)}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">Presupuesto</span>
                <span class="detail-value">$${payload.budgetLimit.toFixed(2)}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">Porcentaje</span>
                <span class="detail-value">${payload.percentage}%</span>
              </div>
              <div class="progress-bar">
                <div class="progress-fill" style="width: ${Math.min(payload.percentage, 100)}%"></div>
              </div>
            </div>
            
            <p style="text-align: center;">
              <a href="${process.env.WEB_URL || 'http://localhost:3000'}/analytics" class="button">Ver Detalles</a>
            </p>
          </div>
          <div class="footer">
            <p>Finance Bot - Notificaciones de Presupuesto</p>
            <p>Puedes configurar tus preferencias en la página de configuración.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  private buildPlainTextTemplate(
    payload: NotificationPayload
  ): string {
    return `
Budget Alert - ${payload.categoryName} at ${payload.percentage}%

Hola,

Tu gasto en ${payload.categoryName} ha alcanzado el ${payload.percentage}% de tu presupuesto.

Detalles:
- Categoría: ${payload.categoryName}
- Gasto actual: $${payload.currentSpending.toFixed(2)}
- Presupuesto: $${payload.budgetLimit.toFixed(2)}
- Porcentaje: ${payload.percentage}%
- Umbral cruzado: ${payload.threshold}%

Ver detalles: ${process.env.WEB_URL || 'http://localhost:3000'}/analytics

---
Finance Bot - Notificaciones de Presupuesto
    `.trim();
  }
}

export default new EmailNotificationService();
