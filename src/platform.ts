import { API, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig, Service, Characteristic } from 'homebridge';
import { PLATFORM_NAME, PLUGIN_NAME } from './settings';
import { TtlockPlatformAccessory } from './platformAccessory';
import { LocksResponse } from './models/locks-response';
import { TtlockApiClient } from './api';
import axios from 'axios';
import qs from 'qs';

/**
 * HomebridgePlatform
 * This class is the main constructor for your plugin, this is where you should
 * parse the user config and discover/register accessories with Homebridge.
 */
export class TtlockPlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service = this.api.hap.Service;
  public readonly Characteristic: typeof Characteristic = this.api.hap.Characteristic;
  private apiClient = new TtlockApiClient(this);

  // this is used to track restored cached accessories
  public readonly accessories: PlatformAccessory[] = [];

  constructor(
    public readonly log: Logger,
    public readonly config: PlatformConfig,
    public readonly api: API,
  ) {
    this.log.debug('Finished initializing platform:', this.config.name);

    // When this event is fired it means Homebridge has restored all cached accessories from disk.
    // Dynamic Platform plugins should only register new accessories after this event was fired,
    // in order to ensure they weren't added to homebridge already. This event can also be used
    // to start discovery of new accessories.
    this.api.on('didFinishLaunching', () => {
      log.debug('Executed didFinishLaunching callback');
      // run the method to discover / register your devices as accessories
      this.discoverDevices();
    });
  }

  /**
   * This function is invoked when homebridge restores cached accessories from disk at startup.
   * It should be used to setup event handlers for characteristics and update respective values.
   */
  configureAccessory(accessory: PlatformAccessory) {
    this.log.info('Loading accessory from cache:', accessory.displayName);

    // add the restored accessory to the accessories cache so we can track if it has already been registered
    this.accessories.push(accessory);
  }

  /**
   * This is an example method showing how to register discovered accessories.
   * Accessories must only be registered once, previously created accessories
   * must not be registered again to prevent "duplicate UUID" errors.
   */
  async discoverDevices() {

    try {
      const theAccessToken = await this.apiClient.getAccessTokenAsync();
      let response;

      // Sends the HTTP request to get the locks on the account
      try {
        const now = new Date().getTime();
        response = await axios.post<LocksResponse>('https://euapi.ttlock.com/v3/lock/list', qs.stringify({
          clientId: this.config.clientid,
          accessToken: theAccessToken,
          pageNo:  1,
          pageSize: 100,
          date: now,
        }), {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        });
        if (response.data.errcode === null || response.data.errcode === undefined) {
          this.log.debug('Number of locks returned from API: ' + String(response.data.list.length));
        } else {
          this.log.error('Ensure your TTLock API keys and username/password are correct in the config. Error: ' + response.data.errcode);
        }


      } catch (e) {
        this.log.error(`Error while getting locks via API: ${e}`);
      }


      // loop over the discovered devices and register each one if it has not already been registered
      if (response.data.errcode === null || response.data.errcode === undefined) {
        if (response.data.list.length > 0) {
          try {
            response.data.list.forEach(device => {
              // generate a unique id for the accessory this should be generated from
              // something globally unique, but constant, for example, the device serial
              // number or MAC address
              const uuid = this.api.hap.uuid.generate(String(device.lockId));

              // see if an accessory with the same uuid has already been registered and restored from
              // the cached devices we stored in the `configureAccessory` method above
              const existingAccessory = this.accessories.find(accessory => accessory.UUID === uuid);

              if (existingAccessory) {
                // the accessory already exists
                this.log.info('Restoring existing accessory from cache:', existingAccessory.displayName);

                // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
                // existingAccessory.context.device = device;
                // this.api.updatePlatformAccessories([existingAccessory]);

                // create the accessory handler for the restored accessory
                // this is imported from `platformAccessory.ts`
                new TtlockPlatformAccessory(this, existingAccessory);

                // it is possible to remove platform accessories at any time using `api.unregisterPlatformAccessories`, eg.:
                // remove platform accessories when no longer present
                // this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [existingAccessory]);
                // this.log.info('Removing existing accessory from cache:', existingAccessory.displayName);
              } else {
                // the accessory does not yet exist, so we need to create it
                this.log.info('Adding new accessory:', device.lockAlias);

                // create a new accessory
                const accessory = new this.api.platformAccessory(device.lockAlias, uuid);

                // store a copy of the device object in the `accessory.context`
                // the `context` property can be used to store any data about the accessory you may need
                accessory.context.device = device;

                // create the accessory handler for the newly create accessory
                // this is imported from `platformAccessory.ts`
                new TtlockPlatformAccessory(this, accessory);

                // link the accessory to your platform
                this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
              }
            },
            );
          } catch (e) {
            this.log.error(`Error while adding devices: ${e}`);
          }
        }
      }
    } catch (e) {
      this.log.error(`Error: ${e}. Ensure your API keys and username/password are correct in the config.`);
    }
  }
}
