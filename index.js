const EventEmitter = require("node:events");
let dbus = require("dbus-next");

/**
 * A notification from the ANCS
 */
class ANCSNotification {
    /**
     * The ID of this notification as a hex string
     * @type {String}
     * @readonly
     */
    id;
    /**
     * The title of this notification
     * @type {String} 
     * @readonly
     */
    title;
    /**
     * The subtitle of this notification. Often not provided, and is a length 0 string if so
     * @type {String} 
     * @readonly
     */
    subtitle;
    /**
     * The main body of this notification
     * @type {String}
     * @readonly
     */
    body;
    /**
     * The ID of the app that sent this notification
     * @type {String}
     * @readonly
     */
    appID;
    /**
     * The date/time the notification was sent
     * @type {Date}
     * @readonly
     */
    date;
    /**
     * The raw byte representation of the notification, as received from the ANCS.
     * @type {Buffer}
     * @readonly 
     */
    raw;

    /**
     * Creates a new ANCS notification
     * @param {String} title 
     * @param {String} subtitle 
     * @param {String} body 
     * @param {String} appID 
     * @param {Date} date 
     * Note: You probably won't want to be creating this (it's for internal use only).
     * Get one from the ANCSClient's events (or notifications property) instead!
     */
    constructor(raw, id, title, subtitle, body, appID, date) {
        this.raw = raw;
        this.id = id;
        this.title = title;
        this.subtitle = subtitle;
        this.body = body;
        this.appID = appID;
        this.date = date;
    }

    /**
     * Converts a notification and its content to a human-readable string
     * @param {String} separator How to divide the content. By default this is a newline (\n) but this may be undesired in a number of situations.
     */
    toReadableString(separator) {
        return `${this.title}${separator ?? '\n'}${this.subtitle}${separator ?? '\n'}${this.body}${separator ?? '\n'}${this.date.toLocaleTimeString()}`;
    }

    /**
     * Converts a notification's data (as it was received from the ANCS) to a string.
     * @param {BufferEncoding} encoding What to encode it as. Default value is 'hex'.
     * @returns {String} .
     * 
     * Note: Should you need a single human-readable string, consider using .toReadableString instead (it's way cooler).
     */
    toString(encoding) {
        return this.raw.toString(encoding ?? 'hex');
    }

    /**
     * Gets app attributes (currently only the app's display name) from the ANCS 
     * @deprecated **This method is experimental and should not be used in production** (yet)
     * @throws {Error}
     * @returns {String}
     * This method is marked as experimental as I was not able to successfully receive the app attributes - 
     * IOS may have stopped supporting this. See Github Issues for the latest on this.
     */
    async getAppFromId() {

    }
}

/**
 * ANCS Client Class
 * @extends EventEmitter
 * @fires ANCSClient#start When this instance starts listening
 * @fires ANCSClient#stop When this instance stops listening
 * @fires ANCSClient#created When a new notification has been received
 * @fires ANCSClient#edited When a notification has been changed
 * @fires ANCSClient#removed When a notification has been removed
 * 
 * Get started by initialising this class like so:
 * ```js
 * let {ANCSClient} = require("ancs-js");
 * let ancs = new ANCSClient();
 * ```
 * You'll want one instance per device you're listening to.
 * 
 */
class ANCSClient extends EventEmitter {
    /**
     * The notification cache. This will update as notifications are created, edited and removed.
     * @type {Object.<string, ANCSNotification>}
     */
    notifications = {};
    /**
     * The MAC Address of the device to listen to.
     * @readonly
     * @type {String}
     */
    MACAddress = "";
    #notificationSource = {};
    #controlPoint = {};
    #dataSource = {};

    /**
     * Create an ANCS instance. 
     * @param {String} MACAddress A valid MAC address
     * @throws {Error} If MAC Address is not valid or provided
     */
    constructor(MACAddress) {
        super(); // Set up event emitter
        if (!MACAddress) throw new Error("No device MAC address provided");
        if (!this.#testMac(MACAddress)) throw new Error("MAC address is invalid. Ensure your MAC address follows the format 01:23:45:67:89:AB");
        this.MACAddress = MACAddress;
    }

    /**
     * Internal method to test if the MAC address provided is valid
     * @param {String} MACAddress The MAC address
     * @returns {Boolean} 
     */
    #testMac(MACAddress) {
        let regex = /^(([A-Fa-f0-9]{2}[:]){5}[A-Fa-f0-9]{2}[,]?)+$/i;
        return regex.test(MACAddress);
    }

    /**
     * Internal method to get the MAC address out of the Bluez interface path name
     * @param {String} path The interface path name
     * @returns {Boolean}
     */
    #matchMacInPath(path, mac) {
        if(path.split("/").find((v) => v == "dev_" + mac.replace(/:/g, '_'))) return true;
        else return false;
    }

    /**
     * Check if a bluetooth device is connectable and has the ANCS. Not required, but highly recommended! ;)
     * @param {String} MACAddress The MAC address to check, e.g `"01:23:45:67:89:AB"`
     * @returns {Promise<boolean>}
     * **Note:** This method checks to see if the device is supported, and does not check to see if it *will* send notifications. This checks for:
     * - If the bluetooth dbus is available
     * - If the bluetooth device is connected
     * - If the device has all the interfaces the ANCS exposes
     * You'll need to wrap a try/catch around .startListening() to detect any other mischief
     */
    async isSupported() {
        // Get bluez interfaces
        try {
            let bus = dbus.systemBus();
            let bluez = await bus.getProxyObject("org.bluez", "/");
            let manager = bluez.getInterface("org.freedesktop.DBus.ObjectManager")
            let objects = await manager.GetManagedObjects();
            let hasNotificationSource = false,
                hasDataSource = false,
                hasControlPoint = false;
            // Iterate through the objects to see if it exists...
            for (const path of Object.keys(objects).filter((v) => this.#matchMacInPath(v, this.MACAddress))) {
                let char = objects[path]["org.bluez.GattCharacteristic1"];
                let uuid = char?.UUID?.value;
                if(!uuid) continue;
                uuid = uuid.toUpperCase();
                if (uuid === "9FBF120D-6301-42D9-8C58-25E699A21DBD") hasNotificationSource = true;
                else if (uuid === "69D1D8F3-45E1-49A8-9821-9BBDFDAAD9D9") hasControlPoint = true;
                else if (uuid === "22EAC6E9-24D6-4BB5-BE44-B36ACE7C7BFB") hasDataSource = true;
            }
            return hasNotificationSource && hasControlPoint && hasDataSource;
        } catch (e) {
            return false;
        }
    }

    /**
     * Begins listening for notifications over bluetooth. Returns True if listening succeeded, false otherwise.
     * @throws {Error} 
     * @param {?Boolean} noparse - Set to True if parsing should NOT be done when a notification is received. Events will still return ANCSNotification objects but only contain data within the "raw" property.
     * @returns {Promise<boolean>} 
     * 
     * Before calling this method:
     * - Check if the device is supported with the .isSupported() function
     * - Listen for the "created", "edited" and "removed" events if needed
     * 
     * Errors are thrown, so it's suggested you wrap this in a try/catch. Possible cases include (but are not limited to):
     * - Bluetooth (through bluez) is not supported on this device
     * - 
     */
    async startListening(noparse) {
        // Get bluez interfaces
        let bus = dbus.systemBus();
        let bluez = await bus.getProxyObject("org.bluez", "/");
        let manager = bluez.getInterface("org.freedesktop.DBus.ObjectManager")
        let objects = await manager.GetManagedObjects();
        // Iterate through until we find all of 'em
        let notificationSource, controlPoint, dataSource;
        for (const path of Object.keys(objects).filter((v) => this.#matchMacInPath(v, this.MACAddress))) {
            let char = objects[path]["org.bluez.GattCharacteristic1"];
            if (!char || !char.UUID) {
                continue;
            }
            if (char.UUID.value.toUpperCase() == "9FBF120D-6301-42D9-8C58-25E699A21DBD") {
                this.#notificationSource.path = path;
                notificationSource = true;
            } else if (char.UUID.value.toUpperCase() == "69D1D8F3-45E1-49A8-9821-9BBDFDAAD9D9") {
                this.#controlPoint.path = path;
                controlPoint = true;
            } else if (char.UUID.value.toUpperCase() == "22EAC6E9-24D6-4BB5-BE44-B36ACE7C7BFB") {
                this.#dataSource.path = path;
                dataSource = true;
            }
        }

        // Don't bother trying to subscribe if we can't
        if (!notificationSource || !controlPoint || !dataSource) return false;
        // Get notification interface and notify
        let notifObj = await bus.getProxyObject('org.bluez', this.#notificationSource.path);
        let notifChar = notifObj.getInterface('org.bluez.GattCharacteristic1');
        try {
            await notifChar.StartNotify();
        } catch(e) {
            throw new Error("Couldn't start notify on NotificationSource. " + e);
        }
        let notifProps = notifObj.getInterface('org.freedesktop.DBus.Properties');

        // Get control path for when we require more details
        const obj = await bus.getProxyObject("org.bluez", this.#controlPoint.path);
        const controlChar = obj.getInterface("org.bluez.GattCharacteristic1");

        // Make a queue for receiving notifications at the start
        let queue = [];
        let isDequeuing;
        // Shockingly nesting functions, don't mind me
        async function dequeue() {
            isDequeuing = true;
            while(queue.length > 0) {
                let next = queue.splice(0, 1);
                await controlChar.WriteValue(
                    // 00 (AppID) 01FFFF (title) 02FFFF (subtitle) 03FFFF (body) 05 (date)
                    // TODO: Support for actions, max sizes
                    Buffer.from("00" + next + "0001FFFF02FFFF03FFFF05", "hex"), {}
                );
            }
            isDequeuing = false;
        }

        // Set our listener.
        this.#notificationSource.listener = notifProps.on('PropertiesChanged', async (iface, changed) => {
            // If a change is detected
            if (changed.Value?.value) {
                // Get hex bytes from message
                const data = Buffer.from(changed.Value.value).toString("hex");
                if (data.length != 16) throw new Error("Unexpected notification message length");
                if (data.substring(0, 2) == "02") {
                    // Notification has been removed :(
                    /**
                    * @event ANCSClient#removed A notification has been removed
                    * @type {ANCSNotification} The notification details before it was removed
                    */
                    this.emit("removed", data.substring(data.length - 8));
                    delete (this.notifications[data.substring(data.length - 8)]);
                } else {
                    // Notification has been created or edited. 
                    queue.push(data.substring(data.length - 8));
                    if(!isDequeuing) dequeue();
                }
            }
        });

        // Get data source interface and notify
        const dataObj = await bus.getProxyObject("org.bluez", this.#dataSource.path);
        const dataChar = dataObj.getInterface('org.bluez.GattCharacteristic1');
        try {
            await dataChar.StartNotify();
        } catch(e) {
            throw new Error("Couldn't start notify on DataSource. " + e);
        }
        const dataProps = dataObj.getInterface('org.freedesktop.DBus.Properties');
        this.#dataSource.listener = dataProps.on("PropertiesChanged", async (iface, changed) => {
            // If a change is detected
            if (changed.Value?.value) {
                let data = Buffer.from(changed.Value.value);
                // Data must be from GetNotificationAttributes command
                if (data[0] == 0) {
                    let notificationID = data.subarray(1, 4).toString("hex"),
                        appID, title, subtitle, body, date;
                    if (!noparse) {
                        // Set our offset from 5, it's the start of the real content.
                        let offset = 5;
                        // App ID
                        if (data[offset] == 0) {
                            // Use the provided length of the App ID
                            let appIdLength = data.readUInt16LE(offset + 1);
                            let appIDStart = offset + 3;
                            let appIDEnd = appIDStart + appIdLength;
                            let appIDBuf = data.subarray(appIDStart, appIDEnd);
                            // If null-terminated remove the trailing 0
                            if (appIDBuf.length > 0 && appIDBuf[appIDBuf.length - 1] == 0) appIDBuf = appIDBuf.subarray(0, appIDBuf.length - 1);
                            appID = appIDBuf.toString();
                            offset = appIDEnd;
                        }
                        // Notification title
                        if (data[offset] == 1) {
                            let titleLength = data.readUInt16LE(offset + 1);
                            let titleStart = offset + 3;
                            let titleEnd = titleStart + titleLength;
                            let titleBuf = data.subarray(titleStart, titleEnd);
                            if (titleBuf.length > 0 && titleBuf[titleBuf.length - 1] === 0) titleBuf = titleBuf.subarray(0, titleBuf.length - 1);
                            title = titleBuf.toString();
                            offset = titleEnd;
                        }
                        // Notification subtitle
                        if (data[offset] == 2) {
                            let subtitleLength = data.readUInt16LE(offset + 1);
                            let subStart = offset + 3;
                            let subEnd = subStart + subtitleLength;
                            let subBuf = data.subarray(subStart, subEnd);
                            if (subBuf.length > 0 && subBuf[subBuf.length - 1] === 0) subBuf = subBuf.subarray(0, subBuf.length - 1);
                            subtitle = subBuf.toString();
                            offset = subEnd;
                        }
                        // And the body
                        if (data[offset] == 3) {
                            let bodyLength = data.readUInt16LE(offset + 1);
                            let bodyStart = offset + 3;
                            let bodyEnd = bodyStart + bodyLength;
                            let bodyBuf = data.subarray(bodyStart, bodyEnd);
                            if (bodyBuf.length > 0 && bodyBuf[bodyBuf.length - 1] === 0) bodyBuf = bodyBuf.subarray(0, bodyBuf.length - 1);
                            body = bodyBuf.toString();
                            offset = bodyEnd;
                        }
                        // And finally the date
                        if (data[offset] == 5) {
                            const dateLength = data.readUInt16LE(offset + 1);
                            const dateStart = offset + 3;
                            const dateEnd = dateStart + dateLength;
                            let dateBuf = data.subarray(dateStart, dateEnd);
                            if (dateBuf.length > 0 && dateBuf[dateBuf.length - 1] === 0) dateBuf = dateBuf.subarray(0, dateBuf.length - 1);
                            // Pull out date from weirdly formatted string
                            let dateStringMatched = dateBuf.toString().match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/);
                            if (dateStringMatched) {
                                const [, year, month, day, hour, minute, second] = dateStringMatched;
                                date = new Date(Number(year), Number(month), Number(day), Number(hour), Number(minute), Number(second));
                            } else {
                                date = dateBuf.toString(); // As a backup
                            }
                            offset = dateEnd;
                        }
                    }

                    // Put together notification data
                    let notificationobj = new ANCSNotification(data, notificationID, title, subtitle, body, appID, date);
                    if (!this.notifications[notificationID]) {
                        // If we don't have it already, emit create event
                        /**
                        * @event ANCSClient#created A notification has been created
                        * @type {ANCSNotification} The new notification content and details.
                        */
                        this.emit("created", notificationobj);
                    } else {
                        // Just edited, so send the edited event
                        /**
                        * @event ANCSClient#edited A notification has been changed
                        * @type {ANCSNotification} The new notification content and details.
                        */
                        this.emit("edited", notificationobj);
                    }
                    this.notifications[notificationID] = notificationobj
                }
            }
        });

        /**
         * @event ANCSClient#start Starts listening for device notifications
         * @type {String} The MAC Address that started.
         */
        this.emit("start", this.MACAddress);
        return true;
    }

    /**
     * Stop listening to events (unsubscribes from the ANCS)
     * This puts the device in a safe state to disconnect
     * @throws {Error} If unable to stop (dependent on the error, usually due to a disconnection).
     * @returns {Promise<boolean>} If stopping succeeded (this is false if already stopped).
     * @deprecated When testing, this wasn't actually needed.
     */
    async stopListening() {
        if (!this.#notificationSource.path || !this.#dataSource.path || !this.#controlPoint.path) return false;
        let bus = dbus.systemBus();
        const notifObj = await bus.getProxyObject('org.bluez', this.#notificationSource.path);
        const notifChar = notifObj.getInterface('org.bluez.GattCharacteristic1');
        await notifChar.StopNotify();
        this.#notificationSource.listener.removeAllListeners("PropertiesChanged");
        delete (this.#notificationSource.path);
        const dataObj = await bus.getProxyObject('org.bluez', this.#dataSource.path);
        const dataChar = dataObj.getInterface('org.bluez.GattCharacteristic1');
        await dataChar.StopNotify();
        this.#dataSource.listener.removeAllListeners("PropertiesChanged");
        /**
         * @event ANCSClient#stop Stops listening for device notifications
         * @type {String} The MAC Address that stopped.
         */
        this.emit("stop", this.MACAddress);
        delete (this.#dataSource.path);
        delete (this.#controlPoint.path);
        return true;
    }


}

module.exports = { ANCSClient, ANCSNotification };