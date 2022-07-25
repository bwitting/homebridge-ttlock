import {
    AccessoryConfig,
    AccessoryPlugin,
    API,
    CharacteristicEventTypes,
    CharacteristicGetCallback,
    CharacteristicSetCallback,
    CharacteristicValue,
    HAP,
    Logging,
    Service
  } from "homebridge";
  
  /*
   * IMPORTANT NOTICE
   *
   * One thing you need to take care of is, that you never ever ever import anything directly from the "homebridge" module (or the "hap-nodejs" module).
   * The above import block may seem like, that we do exactly that, but actually those imports are only used for types and interfaces
   * and will disappear once the code is compiled to Javascript.
   * In fact you can check that by running `npm run build` and opening the compiled Javascript file in the `dist` folder.
   * You will notice that the file does not contain a `... = require("homebridge");` statement anywhere in the code.
   *
   * The contents of the above import statement MUST ONLY be used for type annotation or accessing things like CONST ENUMS,
   * which is a special case as they get replaced by the actual value and do not remain as a reference in the compiled code.
   * Meaning normal enums are bad, const enums can be used.
   *
   * You MUST NOT import anything else which remains as a reference in the code, as this will result in
   * a `... = require("homebridge");` to be compiled into the final Javascript code.
   * This typically leads to unexpected behavior at runtime, as in many cases it won't be able to find the module
   * or will import another instance of homebridge causing collisions.
   *
   * To mitigate this the {@link API | Homebridge API} exposes the whole suite of HAP-NodeJS inside the `hap` property
   * of the api object, which can be acquired for example in the initializer function. This reference can be stored
   * like this for example and used to access all exported variables and classes from HAP-NodeJS.
   */
  let hap: HAP;
  
  /*
   * Initializer function called when the plugin is loaded.
   */
  export = (api: API) => {
    hap = api.hap;
    api.registerAccessory("TTLock", TTLock);
  };
  
  class TTLock implements AccessoryPlugin {
  
    private readonly log: Logging;
    private readonly name: string;
    private locked = false;
  
    private readonly Service: Service;
    private readonly informationService: Service;
  
    constructor(log: Logging, config: AccessoryConfig, api: API) {
      this.log = log;
      this.name = config.name;
  
      this.Service = new Service.LockMechanism(this.Service.LockMechanism);

      //get characteristics
      this.Service.getCharacteristic(hap.Characteristic.LockCurrentState)
        .on(CharacteristicEventTypes.GET, (callback: CharacteristicGetCallback) => {
          log.info("Current state of the switch was returned: " + (this.locked? "ON": "OFF"));
          callback(undefined, this.locked);
        })
        .on(CharacteristicEventTypes.SET, (value: CharacteristicValue, callback: CharacteristicSetCallback) => {
          this.locked = value as boolean;
          log.info("Switch state was set to: " + (this.locked? "ON": "OFF"));
          callback();
        });

      this.informationService = new hap.Service.AccessoryInformation()
        .setCharacteristic(hap.Characteristic.Manufacturer, "Custom Manufacturer")
        .setCharacteristic(hap.Characteristic.Model, "Custom Model");
  
      log.info("Lock finished initializing!");
    }




  /**
   * Handle requests to get the current value of the "Lock Target State" characteristic
   */
  handleLockTargetStateGet() {
    this.log.debug('Triggered GET LockTargetState');

    // set this to a valid value for LockTargetState
    const currentValue = this.Characteristic.LockTargetState.UNSECURED;

    return currentValue;
  }

  /**
   * Handle requests to set the "Lock Target State" characteristic
   */
  handleLockTargetStateSet(value) {
    this.log.debug('Triggered SET LockTargetState:' value);
  }




  
    /*
     * This method is optional to implement. It is called when HomeKit ask to identify the accessory.
     * Typical this only ever happens at the pairing process.
     */
    identify(): void {
      this.log("Identify!");
    }
  
    /*
     * This method is called directly after creation of this instance.
     * It should return all services which should be added to the accessory.
     */
    getServices(): Service[] {
      return [
        this.informationService,
        this.Service,
      ];
    }
  
  }