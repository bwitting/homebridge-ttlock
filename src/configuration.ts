
import { DeviceConfiguration } from './device-configuration';

/**
 * Represents the homebridge configuration for the plugin.
 */
export interface Configuration {

    /**
     * Gets or sets the URI for the token endpoint.
     */
    tokenUri: string;

    /**
     * Gets or sets the number of retries before repoorting failure.
     */
    maximumTokenRetry: number;

    /**
     * Gets or sets the interval between retries in milliseconds.
     */
    tokenRetryInterval: number;

    /**
     * Gets or sets the URI of the HTTP API.
     */
    apiUri: string;

    /**
     * Gets or sets the number of retries before repoorting failure.
     */
    maximumApiRetry: number;

    /**
     * Gets or sets the interval between retries in milliseconds.
     */
    apiRetryInterval: number;

    /**
     * Gets or sets the email address of the Tedee account.
     */
    emailAddress: string;

    /**
     * Gets or sets the password of the Tedee account.
     */
    password: string;

    /**
     * Gets or sets the devices that should be exposed to HomeKit.
     */
    devices: Array<DeviceConfiguration>;

    /**
     * Gets or sets the update interval for device data in seconds.
     */
    updateInterval: number;
}
