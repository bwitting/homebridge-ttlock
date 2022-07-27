
/**
 * Represents a Tedee device in the homebridge configuration for the plugin.
 */
export interface DeviceConfiguration {

    /**
     * Gets or sets the name of the device (used for config mapping).
     */
    name: string;

    /**
     * Gets or sets a value that determines whether the unlatch (unlocked to unlocked) is enabled.
     */
    unlatchFromUnlockedToUnlocked: boolean;

    /**
     * Gets or sets a value that determines whether the unlatch lock is exposed to HomeKit.
     */
    unlatchLock: boolean;

    /**
     * Gets or sets a value that determines whether the unlock actions are supported.
     */
    disableUnlock: boolean;

    /**
     * Gets or sets the default lock name.
     */
    defaultLockName: string;

    /**
     * Gets or sets the default latch name.
     */
    defaultLatchName: string;
}
