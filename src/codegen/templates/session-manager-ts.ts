export function generateSessionManagerTs(): string {
  return `import * as soap from 'soap';
import { buildSessionHeader } from '../soap/header-builder.js';

export interface SessionState {
  userID: string;
  sessionTicket: string;
  expires?: Date;
}

interface SessionConfig {
  userID: string;
  password: string;
  loginType: string;
  loginOperation: string;
  logoutOperation: string;
  otp?: string;
}

export class SessionManager {
  private session: SessionState | null = null;
  private loginPromise: Promise<SessionState> | null = null;
  private authClient: soap.Client;
  private config: SessionConfig;

  constructor(authClient: soap.Client, config: SessionConfig) {
    this.authClient = authClient;
    this.config = config;
  }

  async ensureSession(): Promise<SessionState> {
    if (this.session && !this.isExpired()) {
      console.error('[session] Reusing cached session for', this.session.userID);
      return this.session;
    }

    if (this.loginPromise) {
      return this.loginPromise;
    }

    this.loginPromise = this.login();
    try {
      this.session = await this.loginPromise;
      return this.session;
    } finally {
      this.loginPromise = null;
    }
  }

  private isExpired(): boolean {
    if (!this.session?.expires) return false;
    const buffer = 30 * 1000; // 30 second pre-expiry
    return Date.now() > this.session.expires.getTime() - buffer;
  }

  private async login(): Promise<SessionState> {
    console.error('[session] Logging in as', this.config.userID, 'via', this.config.loginOperation);
    const args: Record<string, unknown> = {
      userID: this.config.userID,
      password: this.config.password,
      loginType: this.config.loginType,
    };
    if (this.config.otp) {
      args.oneTimePassword = this.config.otp;
    }

    const loginMethodName = this.config.loginOperation + 'Async';
    const method = (this.authClient as Record<string, unknown>)[loginMethodName] as (
      args: Record<string, unknown>,
    ) => Promise<[Record<string, unknown>]>;

    if (!method) {
      throw new Error(\`Login operation '\${this.config.loginOperation}' not found on auth client\`);
    }

    const [result] = await method.call(this.authClient, args);
    console.error('[session] Session established for', this.config.userID);

    return {
      userID: this.config.userID,
      sessionTicket: String(result.sessionTicket || result.ticket || ''),
      expires: result.expires ? new Date(String(result.expires)) : undefined,
    };
  }

  async executeWithSession<T>(
    client: soap.Client,
    operation: string,
    args: Record<string, unknown>,
  ): Promise<T> {
    const session = await this.ensureSession();
    this.applySessionHeader(client, session);

    const methodName = operation + 'Async';
    const method = (client as Record<string, unknown>)[methodName] as (
      args: Record<string, unknown>,
    ) => Promise<[T]>;

    if (!method) {
      throw new Error(\`Operation '\${operation}' not found on SOAP client\`);
    }

    console.error('[session] Calling operation:', operation);
    try {
      const [result] = await method.call(client, args);
      return result;
    } catch (error) {
      if (this.isSessionExpiredFault(error)) {
        console.error('[session] Session expired, refreshing...');
        this.session = null;
        const newSession = await this.ensureSession();
        this.applySessionHeader(client, newSession);
        const [result] = await method.call(client, args);
        return result;
      }
      throw error;
    }
  }

  private applySessionHeader(client: soap.Client, session: SessionState): void {
    client.clearSoapHeaders();
    client.addSoapHeader(buildSessionHeader(session));
  }

  private isSessionExpiredFault(error: unknown): boolean {
    try {
      const err = error as Record<string, unknown>;
      const root = err.root as Record<string, unknown> | undefined;
      if (!root) return false;
      const envelope = root.Envelope as Record<string, unknown> | undefined;
      if (!envelope) return false;
      const body = envelope.Body as Record<string, unknown> | undefined;
      if (!body) return false;
      const fault = body.Fault as Record<string, unknown> | undefined;
      if (!fault) return false;
      const detail = fault.detail as Record<string, unknown> | undefined;
      if (!detail) return false;
      const sessionError = detail.sessionError as Record<string, unknown> | undefined;
      if (!sessionError) return false;
      const errorType = String(sessionError.errorType || '');
      return errorType === 'InvalidSession' || errorType === 'SessionExpired';
    } catch {
      return false;
    }
  }

  async logout(): Promise<void> {
    if (!this.session) return;
    console.error('[session] Logging out user:', this.session.userID);
    try {
      this.applySessionHeader(this.authClient, this.session);
      const logoutMethodName = this.config.logoutOperation + 'Async';
      const method = (this.authClient as Record<string, unknown>)[logoutMethodName] as (
        args: Record<string, unknown>,
      ) => Promise<unknown>;
      if (method) {
        await method.call(this.authClient, { userID: this.session.userID });
      }
    } catch {
      // Ignore logout errors
    } finally {
      this.session = null;
    }
  }
}
`;
}
