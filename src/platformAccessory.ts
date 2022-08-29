import { Service, PlatformAccessory, CharacteristicValue } from 'homebridge';
import { TtlockPlatform } from './platform';
import { LockResponse } from './models/lock-response';
import { Lock } from './models/lock';
import { TtlockApiClient } from './api';
import axios from 'axios';
import qs from 'qs';

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class TtlockPlatformAccessory {
  private service: Service;
  private Characteristic = this.platform.api.hap.Characteristic;
  private apiClient = new TtlockApiClient(this.platform);
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
      this.handleLockTargetStateGet;
      this.platform.log.debug('Finished handling lock state change');
    }

  }

  /**
   * Handle the "GET" requests from HomeKit
   * These are sent when HomeKit wants to know the current state of the accessory.
   */

  async handleLockTargetStateGet(): Promise<CharacteristicValue> {

    const accessToken = await this.apiClient.getAccessTokenAsync(Number(this.platform.config.maximumApiRetry));

    interface lockState {
      state: number;
    }

    let currentLockStateValue = 0;
    let currentValue = 0;
    switch(this.lockStates.Locked){
      case true:
        currentValue = this.Characteristic.LockCurrentState.SECURED;
        this.lockStates.Locked = true;
        break;
      case false:
        currentValue = this.Characteristic.LockCurrentState.UNSECURED;
        this.lockStates.Locked = false;
        break;
    }

    const clientId = this.platform.config.clientid;
    const lockId = this.accessory.context.device.lockId;
    const now = new Date().getTime();

    // Sends the HTTP request to get the lock status
    try {
      const response = await axios.get<lockState>
      (`https://euapi.ttlock.com/v3/lock/queryOpenState?clientId=${clientId}&accessToken=${accessToken}&lockId=${lockId}&date=${now}`);
      this.platform.log.debug('Lock state is: ' + String(response.data.state));
      currentLockStateValue = Number(response.data.state);

      switch(currentLockStateValue){
        case 0:
          currentValue = this.Characteristic.LockCurrentState.SECURED;
          this.lockStates.Locked = true;
          break;
        case 1:
          currentValue = this.Characteristic.LockCurrentState.UNSECURED;
          this.lockStates.Locked = false;
          break;
      }

    } catch (e) {
      this.platform.log.warn(`Error while getting status via API: ${e}`);
    } finally {
      //update the lock state characteristic with the currentlock state value
      this.service.getCharacteristic(this.platform.Characteristic.LockCurrentState).updateValue(currentValue);
      //now get the battery level
      this.handleLockBatteryLevelGet();
    }
    return currentValue;

  }


  async handleLockBatteryLevelGet(): Promise<CharacteristicValue> {

    const accessToken = await this.apiClient.getAccessTokenAsync(Number(this.platform.config.maximumApiRetry));

    let currentBatteryLevelValue = 0;
    const clientId = this.platform.config.clientid;
    const lockId = this.accessory.context.device.lockId;
    const now = new Date().getTime();

    // Sends the HTTP request to get the battery level
    try {
      const response = await axios.get<Lock>
      (`https://euapi.ttlock.com/v3/lock/detail?clientId=${clientId}&accessToken=${accessToken}&lockId=${lockId}&date=${now}`);
      this.platform.log.debug('Lock battery level is: ' + String(response.data.electricQuantity));
      currentBatteryLevelValue = Number(response.data.electricQuantity);

    } catch (e) {
      this.platform.log.warn(`Error while getting battery level via API: ${e}`);


    } finally {
      //update the battery level characteristic with the current value
      this.service.getCharacteristic(this.platform.Characteristic.BatteryLevel).updateValue(currentBatteryLevelValue);
      if (currentBatteryLevelValue < Number(this.platform.config.batteryLowLevel)) {
        this.service.getCharacteristic(this.platform.Characteristic.StatusLowBattery).updateValue(true);
        this.platform.log.debug('Low battery level triggered');
      } else {
        this.service.getCharacteristic(this.platform.Characteristic.StatusLowBattery).updateValue(false);
        this.platform.log.debug('Battery level is OK');
      }

    }

    return currentBatteryLevelValue;
  }
}