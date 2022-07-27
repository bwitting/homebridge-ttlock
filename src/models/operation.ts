
import { OperationStatus } from './operation-status';

/**
 * Represents the HTTP API model for a lock operation. The operation is used to track the status.
 */
export interface Operation {

    /**
     * Gets or sets the ID of the operation.
     */
    operationId: string;

    /**
     * Gets or sets the status of the operation.
     */
    status: OperationStatus;
}
