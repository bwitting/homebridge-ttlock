
import { LockList } from './lock-list';

/**
 * Represents the HTTP API model for a response with an array of locks.
 */
export interface LocksResponse {

    /**
     * Gets or sets the requested locks.
     */
    list: Array<LockList>;
}
