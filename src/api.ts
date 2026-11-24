
import axios from 'axios';
import qs from 'qs';

import { TtlockPlatform } from './platform';
import { TokenResponse } from './models/token-response';

/**
 * Represents a client that communicates with the Tedee HTTP API.
 */
export class TtlockApiClient {

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

  /**
     * Gets the access token either from cache or from the token endpoint.
     * @param retryCount The number of retries before reporting failure.
     */
  public async getAccessTokenAsync(retryCount?: number): Promise<string> {
    this.platform.log.debug('Getting access token...');

    // Checks if the current access token is expired
    if (this.expirationDateTime && this.expirationDateTime.getTime() < new Date().getTime() - (120 * 1000)) {
      this.expirationDateTime = null;
      this.accessToken = null;
    }

    // Checks if a cached access token exists
    if (this.accessToken) {
      this.platform.log.debug('Access token cached.');
      return this.accessToken;
    }

    // A missing or invalid argument falls back to the retry limit exposed in
    // config.schema.json. Zero is a valid value: it means one request and no
    // retries.
    if (typeof retryCount !== 'number' || !Number.isFinite(retryCount)) {
      const configuredRetryCount = Number(this.platform.config.maximumApiRetry);
      retryCount = Number.isFinite(configuredRetryCount) ? configuredRetryCount : 0;
    }
    const retriesRemaining = Math.max(0, Math.floor(retryCount));

    for (let attempt = 0; attempt <= retriesRemaining; attempt += 1) {
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
        });

        // Stores the access token
        this.accessToken = String(response.data.access_token);
        this.expirationDateTime = new Date(new Date().getTime() + (response.data.expires_in * 1000));

        // Never write the bearer token to logs.
        this.platform.log.debug('Access token received from server.');
        return this.accessToken;

      } catch (e) {
        this.platform.log.warn(`Error while retrieving access token: ${e}`);
        if (attempt === retriesRemaining) {
          throw e;
        }
      }
    }

    throw new Error('Token request retry loop exited unexpectedly.');
  }
}
