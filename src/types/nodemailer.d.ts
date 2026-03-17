// Type declarations for nodemailer
declare module 'nodemailer' {
  export interface SendMailOptions {
    from?: string;
    to?: string | string[];
    subject?: string;
    text?: string;
    html?: string;
    [key: string]: any;
  }

  export interface Transporter {
    sendMail(options: SendMailOptions): Promise<any>;
  }

  export function createTransport(config: any): Transporter;
}
