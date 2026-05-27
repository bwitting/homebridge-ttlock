import { Service, PlatformAccessory, CharacteristicValue } from 'homebridge';
import { TtlockPlatform } from './platform';
import { LockResponse } from './models/lock-response';
import { Lock } from './models/lock';
import { TtlockApiClient } from './api';
import axios from 'axios';
import qs from 'qs';

interface LockStateResponse {
  state: number;
}

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class TtlockPlatformAccessory {
  private service: Service;

  private Characteristic = this.platform.api.hap.Characteristic;

  private apiClient = new TtlockApiClient(this.platform);

  private readonly stateCacheMs = 10000;

  private readonly batteryCacheMs = 30 * 60 * 1000;

  private lastStateFetch = 0;

  private lastStateValue: number | null = null;

  private lastTargetStateValue: number | null = null;

  private lastBatteryFetch = 0;

  private lastBatteryLevelValue: number | null = null;

  private stateFetchPromise: Promise<number> | null = null;

  private batteryFetchPromise: Promise<number> | null = null;

  /**
   * Set possible states of the lock
   */
  public lockStates = {
    Locked: true,
  };

  constructor(
    private readonly platform: TtlockPlatform,
    private readonly accessory: PlatformAccessory,
  ) {

    // set accessory information
    this.accessory.getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'TTLock Homebridge Platform')
      .setCharacteristic(this.platform.Characteristic.Model, this.getLockModel())
      .setCharacteristic(this.platform.Characteristic.SerialNumber, accessory.context.device.lockMac);

    // get the LockMechanism service if it exists, otherwise create a new LockMechanism service
    // you can create multiple services for each accessory
    this.service = this.accessory.getService(this.platform.Service.LockMechanism) ||
    this.accessory.addService(this.platform.Service.LockMechanism);

    // set the service name, this is what is displayed as the default name on the Home app
    this.service.setCharacteristic(this.platform.Characteristic.Name, accessory.context.device.lockAlias);

    // register handlers for the Target State Characteristic
    this.service.getCharacteristic(this.platform.Characteristic.LockTargetState)
      .onSet(this.handleLockTargetStateSet.bind(this))
      .onGet(this.handleLockTargetStateGet.bind(this));

    // register handlers for the Lock Current State Characteristic
    this.service.getCharacteristic(this.platform.Characteristic.LockCurrentState)
      .onGet(this.handleLockCurrentStateGet.bind(this));

    this.service.getCharacteristic(this.platform.Characteristic.BatteryLevel)
      .onGet(this.handleLockBatteryLevelGet.bind(this));
  }

  /**
   * Handle "SET" requests from HomeKit
   * These are sent when the user changes the state of an accessory.
   */
  async handleLockTargetStateSet(value: CharacteristicValue) {
    const requestedTargetState = Number(value);
    const targetState = this.Characteristic.LockTargetState;

    if (requestedTargetState !== targetState.SECURED && requestedTargetState !== targetState.UNSECURED) {
      this.platform.log.warn(`${this.accessory.context.device.lockAlias} received unsupported target state: ${requestedTargetState}`);
      return;
    }

    const urlString = requestedTargetState === targetState.SECURED ? 'lock' : 'unlock';
    const previousCurrentStateValue = this.lastStateValue ?? this.getAssumedCurrentState();
    const previousTargetStateValue = this.lastTargetStateValue ?? this.getTargetStateFromCurrentState(previousCurrentStateValue);
    const nextCurrentStateValue = this.getCurrentStateFromTargetState(requestedTargetState);
    const lockId = this.accessory.context.device.lockId;

    try {
      const accessToken = await this.apiClient.getAccessTokenAsync(Number(this.platform.config.maximumApiRetry));
      const now = new Date().getTime();

      const response = await axios.post<LockResponse>(`https://euapi.ttlock.com/v3/lock/${urlString}`, qs.stringify({
        clientId: this.platform.config.clientid,
        accessToken: accessToken,
        lockId: lockId,
        date: now,
      }), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        timeout: 10000,
      });

      this.platform.log.debug(`https://euapi.ttlock.com/v3/lock/${urlString}`);
      this.platform.log.debug(JSON.stringify(response.data));
      this.platform.log.debug('Returned: ' + String(response.data.errcode));

      // API returns error code 0 if the request was successful
      if (response.data.errcode === 0) {
        this.setCachedCurrentState(nextCurrentStateValue);
        this.lastTargetStateValue = requestedTargetState;
        this.updateLockCharacteristics(nextCurrentStateValue, requestedTargetState);
        this.platform.log.info(this.accessory.context.device.lockAlias + ' ' + urlString + 'ed successfully.');
      } else if (response.data.errcode === -3003) {
        this.platform.log.error(
          urlString + 'ing of ' + this.accessory.context.device.lockAlias + ' failed. The gateway is currently busy.',
        );
        this.restoreLockState(previousCurrentStateValue, previousTargetStateValue);
      } else {
        this.platform.log.warn(
          `${urlString}ing of ${this.accessory.context.device.lockAlias} failed with TTLock error ${response.data.errcode}`,
        );
        this.restoreLockState(previousCurrentStateValue, previousTargetStateValue);
      }

    } catch (e) {
      this.platform.log.warn(`${this.accessory.context.device.lockAlias} ${urlString} failed: ${e}`);
      this.restoreLockState(previousCurrentStateValue, previousTargetStateValue);

    } finally {
      this.platform.log.debug('Finished handling lock state change');
    }
  }

  /**
   * Handle the "GET" requests from HomeKit
   * These are sent when HomeKit wants to know the current target state of the accessory.
   */
  async handleLockTargetStateGet(): Promise<CharacteristicValue> {
    const currentValue = await this.getLockCurrentState();
    const targetValue = this.getTargetStateFromCurrentState(currentValue);

    this.lastTargetStateValue = targetValue;
    this.updateLockCharacteristics(currentValue, targetValue);
    void this.handleLockBatteryLevelGet();

    return targetValue;
  }

  /**
   * Handle the "GET" requests from HomeKit
   * These are sent when HomeKit wants to know the current state of the accessory.
   */
  async handleLockCurrentStateGet(): Promise<CharacteristicValue> {
    const currentValue = await this.getLockCurrentState();
    const targetValue = this.getTargetStateFromCurrentState(currentValue);

    this.lastTargetStateValue = targetValue;
    this.updateLockCharacteristics(currentValue, targetValue);
    void this.handleLockBatteryLevelGet();

    return currentValue;
  }

  async handleLockBatteryLevelGet(): Promise<CharacteristicValue> {
    const now = new Date().getTime();

    if (this.lastBatteryLevelValue !== null && now - this.lastBatteryFetch < this.batteryCacheMs) {
      this.updateBatteryCharacteristics(this.lastBatteryLevelValue);
      return this.lastBatteryLevelValue;
    }

    if (this.batteryFetchPromise) {
      return await this.batteryFetchPromise;
    }

    this.batteryFetchPromise = this.fetchBatteryLevel();

    try {
      return await this.batteryFetchPromise;
    } finally {
      this.batteryFetchPromise = null;
    }
  }

  private getLockModel(): string {
    const lockVersion = this.accessory.context.device.lockVersion;
    const groupId = Array.isArray(lockVersion) ? lockVersion[0]?.groupId : lockVersion?.groupId;
    const model = String(groupId || '').trim();

    return model.length > 0 ? model : 'TTLock';
  }

  private async getLockCurrentState(): Promise<number> {
    const now = new Date().getTime();

    if (this.lastStateValue !== null && now - this.lastStateFetch < this.stateCacheMs) {
      return this.lastStateValue;
    }

    if (this.stateFetchPromise) {
      return await this.stateFetchPromise;
    }

    this.stateFetchPromise = this.fetchLockCurrentState();

    try {
      return await this.stateFetchPromise;
    } finally {
      this.stateFetchPromise = null;
    }
  }

  private async fetchLockCurrentState(): Promise<number> {
    const currentValue = this.lastStateValue ?? this.getAssumedCurrentState();
    const clientId = this.platform.config.clientid;
    const lockId = this.accessory.context.device.lockId;

    try {
      const accessToken = await this.apiClient.getAccessTokenAsync(Number(this.platform.config.maximumApiRetry));
      const now = new Date().getTime();
      const response = await axios.get<LockStateResponse>(`https://euapi.ttlock.com/v3/lock/queryOpenState?${qs.stringify({
        clientId: clientId,
        accessToken: accessToken,
        lockId: lockId,
        date: now,
      })}`, {
        timeout: 8000,
      });
      const lockStateValue = Number(response.data.state);
      const currentLockStateValue = this.getCurrentStateFromApiState(lockStateValue);

      this.platform.log.debug('Lock state is: ' + String(response.data.state));
      this.setCachedCurrentState(currentLockStateValue);

      return currentLockStateValue;

    } catch (e) {
      this.platform.log.warn(`Error while getting status via API: ${e}`);

      if (this.lastStateValue !== null) {
        this.lastStateFetch = new Date().getTime();
      }

      return currentValue;
    }
  }

  private async fetchBatteryLevel(): Promise<number> {
    let currentBatteryLevelValue = this.lastBatteryLevelValue ?? 0;
    const clientId = this.platform.config.clientid;
    const lockId = this.accessory.context.device.lockId;

    try {
      const accessToken = await this.apiClient.getAccessTokenAsync(Number(this.platform.config.maximumApiRetry));
      const now = new Date().getTime();
      const response = await axios.get<Lock>(`https://euapi.ttlock.com/v3/lock/detail?${qs.stringify({
        clientId: clientId,
        accessToken: accessToken,
        lockId: lockId,
        date: now,
      })}`, {
        timeout: 8000,
      });
      const batteryLevel = Number(response.data.electricQuantity);

      currentBatteryLevelValue = Number.isFinite(batteryLevel) ? Math.max(0, Math.min(100, batteryLevel)) : 0;
      this.lastBatteryLevelValue = currentBatteryLevelValue;
      this.lastBatteryFetch = new Date().getTime();
      this.platform.log.debug('Lock battery level is: ' + String(response.data.electricQuantity));

    } catch (e) {
      this.platform.log.warn(`Error while getting battery level via API: ${e}`);
    }

    this.updateBatteryCharacteristics(currentBatteryLevelValue);
    return currentBatteryLevelValue;
  }

  private getAssumedCurrentState(): number {
    return this.lockStates.Locked
      ? this.Characteristic.LockCurrentState.SECURED
      : this.Characteristic.LockCurrentState.UNSECURED;
  }

  private getCurrentStateFromTargetState(targetStateValue: number): number {
    return targetStateValue === this.Characteristic.LockTargetState.SECURED
      ? this.Characteristic.LockCurrentState.SECURED
      : this.Characteristic.LockCurrentState.UNSECURED;
  }

  private getTargetStateFromCurrentState(currentStateValue: number): number {
    if (currentStateValue === this.Characteristic.LockCurrentState.SECURED) {
      return this.Characteristic.LockTargetState.SECURED;
    }

    if (currentStateValue === this.Characteristic.LockCurrentState.UNSECURED) {
      return this.Characteristic.LockTargetState.UNSECURED;
    }

    return this.lastTargetStateValue ?? this.Characteristic.LockTargetState.SECURED;
  }

  private getCurrentStateFromApiState(lockStateValue: number): number {
    switch (lockStateValue) {
      case 0:
        this.lockStates.Locked = true;
        return this.Characteristic.LockCurrentState.SECURED;
      case 1:
        this.lockStates.Locked = false;
        return this.Characteristic.LockCurrentState.UNSECURED;
      default:
        this.platform.log.warn(`${this.accessory.context.device.lockAlias} returned unknown lock state: ${lockStateValue}`);
        return this.lastStateValue ?? this.Characteristic.LockCurrentState.UNKNOWN;
    }
  }

  private setCachedCurrentState(currentStateValue: number) {
    this.lastStateValue = currentStateValue;
    this.lastStateFetch = new Date().getTime();

    if (currentStateValue === this.Characteristic.LockCurrentState.SECURED) {
      this.lockStates.Locked = true;
    } else if (currentStateValue === this.Characteristic.LockCurrentState.UNSECURED) {
      this.lockStates.Locked = false;
    }
  }

  private updateLockCharacteristics(currentStateValue: number, targetStateValue: number) {
    this.service.getCharacteristic(this.platform.Characteristic.LockCurrentState).updateValue(currentStateValue);
    this.service.getCharacteristic(this.platform.Characteristic.LockTargetState).updateValue(targetStateValue);
  }

  private restoreLockState(currentStateValue: number, targetStateValue: number) {
    this.setCachedCurrentState(currentStateValue);
    this.lastTargetStateValue = targetStateValue;
    this.updateLockCharacteristics(currentStateValue, targetStateValue);
  }

  private updateBatteryCharacteristics(currentBatteryLevelValue: number) {
    this.service.getCharacteristic(this.platform.Characteristic.BatteryLevel).updateValue(currentBatteryLevelValue);

    if (currentBatteryLevelValue < Number(this.platform.config.batteryLowLevel)) {
      this.service.getCharacteristic(this.platform.Characteristic.StatusLowBattery)
        .updateValue(this.Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW);
      this.platform.log.debug('Low battery level triggered');
    } else {
      this.service.getCharacteristic(this.platform.Characteristic.StatusLowBattery)
        .updateValue(this.Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL);
      this.platform.log.debug('Battery level is OK');
    }
  }
}
