import { LockVersion } from './lock-version';


export interface LockList {

    /**
     * Gets or sets the ID of the lock.
     */
    lockId: number;

    /**
     * Gets or sets the lockAlias of the lock.
     */
    lockAlias: string;

     /**
     * Gets or sets the lockName of the lock.
     */
    lockName: string;

    /**
     * Gets or sets the MAC address of the lock.
     */
    lockMac: string;

    /**
     * Gets or sets the battery level of the lock (0-100).
     */
    electricQuantity: string;

    /**
     * Gets or sets the hasgateway value of the lock (must be associated with a gateway to work with this plugin).
     */
    hasGateway: string;

    /**
     * Gets or sets the array for LockVersion details.
     */
    lockVersion: Array<LockVersion>;
}
