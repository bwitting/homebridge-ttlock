import { Service, PlatformAccessory, CharacteristicValue } from 'homebridge';
import { TtlockPlatform } from './platform';
import { LockResponse } from './models/lock-response';
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
    // in this example we are using the name we stored in the `accessory.context` in the `discoverDevices` method.
    this.service.setCharacteristic(this.platform.Characteristic.Name, accessory.context.device.lockAlias);

    // each service must implement at-minimum the "required characteristics" for the given service type
    // see https://developers.homebridge.io/#/service/Lightbulb

    // register handlers for the On/Off Characteristic
    this.service.getCharacteristic(this.platform.Characteristic.LockTargetState)
      .onSet(this.handleLockTargetStateSet.bind(this))                // SET - bind to the `setOn` method below
      .onGet(this.handleLockTargetStateGet.bind(this));               // GET - bind to the `getOn` method below

    // register handlers for the Brightness Characteristic
    this.service.getCharacteristic(this.platform.Characteristic.LockCurrentState)
      .onGet(this.handleLockTargetStateGet.bind(this));       // SET - bind to the 'setBrightness` method below

  }

  /**
   * Handle "SET" requests from HomeKit
   * These are sent when the user changes the state of an accessory, for example, turning on a Light bulb.
   */
  async handleLockTargetStateSet() {

    let urlString = 'lock';
    let currentValue = 0;
    switch(this.lockStates.Locked){
      case true:
        currentValue = this.Characteristic.LockCurrentState.SECURED;
        this.lockStates.Locked = true;
        urlString = 'unlock';
        break;
      case false:
        currentValue = this.Characteristic.LockCurrentState.UNSECURED;
        this.lockStates.Locked = false;
        urlString = 'lock';
        break;
    }

    const theAccessToken = await this.apiClient.getAccessTokenAsync();
    const lockId = this.accessory.context.device.lockId;
    const now = new Date().getTime();

    // Sends the HTTP request to set the lock state
    try {
      const response = await axios.post<LockResponse>(`https://api.ttlock.com/v3/lock/${urlString}`, qs.stringify({
        clientId: this.platform.config.clientid,
        accessToken: theAccessToken,
        lockId: lockId,
        date: now,
      }), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });

      this.platform.log.debug(`https://api.ttlock.com/v3/${urlString}`);
      this.platform.log.debug(JSON.stringify(response.data));
      this.platform.log.debug('Returned: ' + String(response.data.errcode));

      // API returns error code 0 if the request was successful
      if (response.data.errcode === 0) {
        switch(this.lockStates.Locked){
          case true:
            currentValue = this.Characteristic.LockCurrentState.UNSECURED;
            this.lockStates.Locked = false;
            break;
          case false:
            currentValue = this.Characteristic.LockCurrentState.SECURED;
            this.lockStates.Locked = true;
            break;
        }
        this.service.getCharacteristic(this.platform.Characteristic.LockCurrentState).updateValue(currentValue);
        this.platform.log.info(this.accessory.context.device.lockAlias + ' ' + urlString + 'ed successfully. ' + currentValue);
      } else {
        //update lock state to current value
        this.service.getCharacteristic(this.platform.Characteristic.LockCurrentState).updateValue(currentValue);
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
   * These are sent when HomeKit wants to know the current state of the accessory, for example, checking if a Light bulb is on.
   *
   * GET requests should return as fast as possbile. A long delay here will result in
   * HomeKit being unresponsive and a bad user experience in general.
   *
   * If your device takes time to respond you should update the status of your device
   * asynchronously instead using the `updateCharacteristic` method instead.

   * @example
   * this.service.updateCharacteristic(this.platform.Characteristic.On, true)
   */

  async handleLockTargetStateGet(): Promise<CharacteristicValue> {

    // TODO
    // call API to see if lock is locked or unlocked

    //const theAccessToken = await this.getAccessTokenAsync();

    //const apiClient = new TtlockApiClient(this.platform);

    const theAccessToken = await this.apiClient.getAccessTokenAsync(1);

    interface lockState {
      state: number;
    }

    let lockStateValue = 0;
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

    // Sends the HTTP request to set the box status
    try {
      // eslint-disable-next-line max-len
      const response = await axios.get<lockState>(`https://api.ttlock.com/v3/lock/queryOpenState?clientId=${clientId}&accessToken=${theAccessToken}&lockId=${lockId}&date=${now}`);
      this.platform.log.debug('Lock state is: ' + String(response.data.state));
      lockStateValue = Number(response.data.state);

      switch(lockStateValue){
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
      this.service.getCharacteristic(this.platform.Characteristic.LockCurrentState).updateValue(currentValue);
    }

    return currentValue;

  }
}