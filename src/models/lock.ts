export interface Lock {

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
     * Gets or sets the battery level of the lock.
     */
    electricQuantity: string;
}
