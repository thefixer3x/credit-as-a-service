import { HttpClient } from '../core/http-client.js';
import { CaasValidationError } from '../types/index.js';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn?: number;
}

export class AuthService {
  constructor(private httpClient: HttpClient) {}

  async login(credentials: { email: string; password: string }): Promise<AuthTokens> {
    const response = await this.httpClient.post<AuthTokens>('/auth/login', credentials);
    if (!response.success || !response.data) {
      throw new CaasValidationError('Login failed', response.error);
    }
    this.httpClient.updateConfig({
      apiKey: response.data.accessToken,
      refreshToken: response.data.refreshToken,
    });
    return response.data;
  }

  async refresh(refreshToken: string): Promise<AuthTokens> {
    const response = await this.httpClient.post<AuthTokens>('/auth/refresh', { refreshToken });
    if (!response.success || !response.data) {
      throw new CaasValidationError('Token refresh failed', response.error);
    }
    this.httpClient.updateConfig({
      apiKey: response.data.accessToken,
      refreshToken: response.data.refreshToken,
    });
    return response.data;
  }

  async logout(): Promise<boolean> {
    const response = await this.httpClient.post<{ loggedOut: boolean }>('/auth/logout');
    return response.success;
  }
}
