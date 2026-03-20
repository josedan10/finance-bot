declare module 'web-push' {
  export interface VapidDetails {
    subject: string;
    publicKey: string;
    privateKey: string;
  }

  export interface PushSubscription {
    endpoint: string;
    keys: {
      p256dh: string;
      auth: string;
    };
  }

  export interface RequestOptions {
    headers?: { [key: string]: string };
    timeout?: number;
    proxy?: string;
    agent?: unknown;
    contentEncoding?: string;
  }

  export function setVapidDetails(subject: string, publicKey: string, privateKey: string): void;
  export function sendNotification(subscription: PushSubscription, payload?: string | Buffer, options?: RequestOptions): Promise<unknown>;
  
  export class WebPushError extends Error {
    statusCode: number;
    headers: { [key: string]: string };
    body: string;
    endpoint: string;
  }
}
