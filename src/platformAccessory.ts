import { Service, PlatformAccessory, CharacteristicValue } from 'homebridge';
import { TtlockPlatform } from './platform';
import { LockResponse } from './models/lock-response';
import { Lock } from './models/lock';
import axios from 'axios';
import qs from 'qs';

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class TtlockPlatformAccessory {
  private static readonly REFRESH_THROTTLE_MS = 10_000;

  private service: Service;
  private Characteristic = this.platform.api.hap.Characteristic;
  private apiClient = this.platform.apiClient;

  // Background refresh state: HomeKit reads return cached state immediately
  // and a refresh is kicked off in the background, throttled per accessory.
  private refreshLockInFlight = false;
  private lastLockRefreshAt = 0;
  private refreshBatteryInFlight = false;
  private lastBatteryRefreshAt = 0;

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
      .setCharacteristic(this.platform.Characteristic.Model, String(accessory.context.device.lockVersion.groupId))
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
      .onGet(this.handleLockTargetStateGet.bind(this));
  }

  /**
   * Handle "SET" requests from HomeKit
   * These are sent when the user changes the state of an accessory.
   */
  async handleLockTargetStateSet() {

    let urlString = 'lock';
    let currentLockStateValue = 0;
    switch(this.lockStates.Locked){
      case true:
        currentLockStateValue = this.Characteristic.LockCurrentState.SECURED;
        this.lockStates.Locked = true;
        urlString = 'unlock';
        break;
      case false:
        currentLockStateValue = this.Characteristic.LockCurrentState.UNSECURED;
        this.lockStates.Locked = false;
        urlString = 'lock';
        break;
    }

    const accessToken = await this.apiClient.getAccessTokenAsync(Number(this.platform.config.maximumApiRetry));
    const lockId = this.accessory.context.device.lockId;
    const now = new Date().getTime();

    // Sends the HTTP request to set the lock state
    try {
      const response = await axios.post<LockResponse>(`https://euapi.ttlock.com/v3/lock/${urlString}`, qs.stringify({
        clientId: this.platform.config.clientid,
        accessToken: accessToken,
        lockId: lockId,
        date: now,
      }), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });

      this.platform.log.debug(`https://euapi.ttlock.com/v3/${urlString}`);
      this.platform.log.debug(JSON.stringify(response.data));
      this.platform.log.debug('Returned: ' + String(response.data.errcode));

      // API returns error code 0 if the request was successful
      if (response.data.errcode === 0) {
        switch(this.lockStates.Locked){
          case true:
            currentLockStateValue = this.Characteristic.LockCurrentState.UNSECURED;
            this.lockStates.Locked = false;
            break;
          case false:
            currentLockStateValue = this.Characteristic.LockCurrentState.SECURED;
            this.lockStates.Locked = true;
            break;
        }
        this.service.getCharacteristic(this.platform.Characteristic.LockCurrentState).updateValue(currentLockStateValue);
        this.platform.log.info(this.accessory.context.device.lockAlias + ' ' + urlString + 'ed successfully.');
      } else if (response.data.errcode === -3003){
        this.platform.log.error(urlString +'ing of ' +this.accessory.context.device.lockAlias + ' failed. The gateway is currently busy.');
        //update lock state to old value
        this.service.getCharacteristic(this.platform.Characteristic.LockCurrentState).updateValue(currentLockStateValue);
      } else {
        //update lock state to old value
        this.service.getCharacteristic(this.platform.Characteristic.LockCurrentState).updateValue(currentLockStateValue);
      }

    } catch (e) {
      this.platform.log.warn(`${this.accessory.context.device.lockAlias} ${urlString} failed: ${e}`);

    } finally {
      // Force a fresh state refresh after a set; bypasses the throttle so HomeKit
      // sees the device-confirmed state quickly. The in-flight guard inside
      // refreshLockState still prevents stacking.
      void this.refreshLockState();
      this.platform.log.debug('Finished handling lock state change');
    }

  }

  /**
   * Handle the "GET" requests from HomeKit.
   * Returns the cached state immediately and triggers a throttled background
   * refresh from the TTLock API. Fresh state, when available, is pushed to
   * HomeKit via updateValue() rather than blocking the read handler.
   */
  async handleLockTargetStateGet(): Promise<CharacteristicValue> {
    const cached = this.lockStates.Locked
      ? this.Characteristic.LockCurrentState.SECURED
      : this.Characteristic.LockCurrentState.UNSECURED;
    this.maybeRefreshLockState();
    return cached;
  }

  /**
   * Trigger a background lock-state refresh, subject to the throttle and the
   * in-flight guard. Safe to call from HomeKit GET handlers.
   */
  private maybeRefreshLockState(): void {
    if (this.refreshLockInFlight) {
      return;
    }
    if (Date.now() - this.lastLockRefreshAt < TtlockPlatformAccessory.REFRESH_THROTTLE_MS) {
      return;
    }
    void this.refreshLockState();
  }

  /**
   * Fetch the lock state from the TTLock API and push it to HomeKit on success.
   * On failure, leaves HomeKit's last-known state alone. Always chains a battery
   * refresh in the finally block (also throttled).
   */
  private async refreshLockState(): Promise<void> {
    if (this.refreshLockInFlight) {
      return;
    }
    this.refreshLockInFlight = true;
    this.lastLockRefreshAt = Date.now();

    interface lockState {
      state: number;
    }

    try {
      const accessToken = await this.apiClient.getAccessTokenAsync(Number(this.platform.config.maximumApiRetry));

      const clientId = this.platform.config.clientid;
      const lockId = this.accessory.context.device.lockId;
      const now = new Date().getTime();

      const response = await axios.get<lockState>
      (`https://euapi.ttlock.com/v3/lock/queryOpenState?clientId=${clientId}&accessToken=${accessToken}&lockId=${lockId}&date=${now}`,
        { timeout: 4000 });
      this.platform.log.debug('Lock state is: ' + String(response.data.state));

      let newValue: CharacteristicValue | undefined;
      switch (Number(response.data.state)) {
        case 0:
          this.lockStates.Locked = true;
          newValue = this.Characteristic.LockCurrentState.SECURED;
          break;
        case 1:
          this.lockStates.Locked = false;
          newValue = this.Characteristic.LockCurrentState.UNSECURED;
          break;
      }

      if (newValue !== undefined) {
        this.service.getCharacteristic(this.platform.Characteristic.LockCurrentState).updateValue(newValue);
        this.service.getCharacteristic(this.platform.Characteristic.LockTargetState).updateValue(newValue);
      }

    } catch (e) {
      this.platform.log.warn(`Error while getting status via API: ${e}`);
    } finally {
      this.refreshLockInFlight = false;
      this.maybeRefreshBatteryLevel();
    }
  }

  /**
   * Trigger a background battery-level refresh, subject to the throttle and
   * the in-flight guard.
   */
  private maybeRefreshBatteryLevel(): void {
    if (this.refreshBatteryInFlight) {
      return;
    }
    if (Date.now() - this.lastBatteryRefreshAt < TtlockPlatformAccessory.REFRESH_THROTTLE_MS) {
      return;
    }
    void this.refreshBatteryLevel();
  }

  /**
   * Fetch the battery level from the TTLock API and push it to HomeKit on
   * success. On failure, leaves HomeKit's last-known battery values alone.
   */
  private async refreshBatteryLevel(): Promise<void> {
    if (this.refreshBatteryInFlight) {
      return;
    }
    this.refreshBatteryInFlight = true;
    this.lastBatteryRefreshAt = Date.now();

    try {
      const accessToken = await this.apiClient.getAccessTokenAsync(Number(this.platform.config.maximumApiRetry));

      const clientId = this.platform.config.clientid;
      const lockId = this.accessory.context.device.lockId;
      const now = new Date().getTime();

      const response = await axios.get<Lock>
      (`https://euapi.ttlock.com/v3/lock/detail?clientId=${clientId}&accessToken=${accessToken}&lockId=${lockId}&date=${now}`,
        { timeout: 4000 });
      this.platform.log.debug('Lock battery level is: ' + String(response.data.electricQuantity));
      const fresh = Number(response.data.electricQuantity);

      this.service.getCharacteristic(this.platform.Characteristic.BatteryLevel).updateValue(fresh);
      if (fresh < Number(this.platform.config.batteryLowLevel)) {
        this.service.getCharacteristic(this.platform.Characteristic.StatusLowBattery).updateValue(true);
        this.platform.log.debug('Low battery level triggered');
      } else {
        this.service.getCharacteristic(this.platform.Characteristic.StatusLowBattery).updateValue(false);
        this.platform.log.debug('Battery level is OK');
      }

    } catch (e) {
      this.platform.log.warn(`Error while getting battery level via API: ${e}`);
    } finally {
      this.refreshBatteryInFlight = false;
    }
  }
}
