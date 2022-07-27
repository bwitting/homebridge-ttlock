/**
 * Represents the HTTP API model for a response with the token.
 */
export interface TokenResponse {

    /**
     * Gets or sets the actual access token.
     */
    access_token: string;

    /**
     * Gets or sets the expiration in seconds.
     */
    expires_in: number;
}
