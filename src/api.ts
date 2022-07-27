
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

    // Set the default retry count
    if (!retryCount) {
      retryCount = this.platform.config.maximumTokenRetry;
    }

    // Sends the HTTP request to get a new access token
    try {
      const response = await axios.post<TokenResponse>('https://api.ttlock.com/oauth2/token', qs.stringify({
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

      // Returns the access token
      this.platform.log.debug('Access token received from server.' + this.accessToken);
      return this.accessToken;

    } catch (e) {
      this.platform.log.warn(`Error while retrieving access token: ${e}`);
      return await this.getAccessTokenAsync(retryCount);
    }
  }
}
