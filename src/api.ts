
import axios from 'axios';
import qs from 'qs';

import { TtlockPlatform } from './platform';
import { TokenResponse } from './models/token-response';

/**
 * Represents a client that communicates with the TTLock HTTP API.
 */
export class TtlockApiClient {

  private readonly tokenRefreshSkewMs = 120 * 1000;

  /**
     * Initializes a new TtlockApiClient instance.
     * @param platform The platform of the plugin.
     */
  constructor(private platform: TtlockPlatform) { }

  /**
     * Contains the expiration date time for the access token.
     */
  private expirationDateTime: Date|null = null;

  /**
     * Contains the currently active access token.
     */
  public accessToken: string|null = null;

  private accessTokenFetchPromise: Promise<string> | null = null;

  /**
     * Gets the access token either from cache or from the token endpoint.
     * @param retryCount The number of retries before reporting failure.
     */
  public async getAccessTokenAsync(retryCount?: number): Promise<string> {
    this.platform.log.debug('Getting access token...');

    // Checks if the current access token is expired or close to expiry.
    if (this.expirationDateTime && this.expirationDateTime.getTime() <= new Date().getTime() + this.tokenRefreshSkewMs) {
      this.expirationDateTime = null;
      this.accessToken = null;
    }

    // Checks if a cached access token exists.
    if (this.accessToken) {
      this.platform.log.debug('Access token cached.');
      return this.accessToken;
    }

    if (this.accessTokenFetchPromise) {
      this.platform.log.debug('Access token request already in progress.');
      return await this.accessTokenFetchPromise;
    }

    this.accessTokenFetchPromise = this.requestAccessTokenAsync(this.getRetryCount(retryCount));

    try {
      return await this.accessTokenFetchPromise;
    } finally {
      this.accessTokenFetchPromise = null;
    }
  }

  private getRetryCount(retryCount?: number): number {
    const configuredRetryCount = Number(retryCount || this.platform.config.maximumApiRetry || 3);

    if (!Number.isFinite(configuredRetryCount) || configuredRetryCount < 1) {
      return 3;
    }

    return Math.floor(configuredRetryCount);
  }

  private async requestAccessTokenAsync(retriesRemaining: number): Promise<string> {
    try {
      const response = await axios.post<TokenResponse>('https://euapi.ttlock.com/oauth2/token', qs.stringify({
        client_id: this.platform.config.clientid,
        client_secret: this.platform.config.clientsecret,
        username:  this.platform.config.username,
        password: this.platform.config.password,
      }), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        timeout: 8000,
      });

      // Stores the access token.
      this.accessToken = String(response.data.access_token);
      this.expirationDateTime = new Date(new Date().getTime() + (response.data.expires_in * 1000));

      // Returns the access token.
      this.platform.log.debug('Access token received from server.');
      return this.accessToken;

    } catch (e) {
      this.platform.log.warn(`Error while retrieving access token: ${e}`);

      if (retriesRemaining <= 1) {
        throw e;
      }

      return await this.requestAccessTokenAsync(retriesRemaining - 1);
    }
  }
}
