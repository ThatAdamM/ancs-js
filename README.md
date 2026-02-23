# ancs-js

The Apple Notification Centre Service (ANCS for short) provides iOS devices with a way to send notifications off-device using a bluetooth connection.

This library takes advantage of that to provide a programmable interface to get your notifications easily!

# Getting Started
## Prerequisites

- **NodeJS** (Recommended version is >20, should run on >16).
- **Linux** (Most standard distributions using bluez will work).
- **iOS Device** (Devices on or above iOS 9 should support the ANCS).
- **Bluetooth** (Must support BLE (Bluetooth Low Energy) - most modern computers probably do).

## Setup

Install the library from NPM:
```
npm install ancs-js
```
And use it in your project like so:
```js
let {ANCSClient} = require("ancs-js");
let macaddress = "AB:CD:EF:01:23:45";
let device = new ANCSClient(macaddress);
```

> ![!TIP]
> You can find your iOS device's bluetooth MAC address in Settings > General > About

### API Usage

> [!IMPORTANT]
> Your device may fail to show any interfaces and return `false` when using `.isSupported()`. Alternatively, you may receive a "Not supported" error.
>
> Please ensure you do the following to avoid these:
> - **Forget the device** on both sides and try again
> - Ensure you connect to your device **from iOS**
>   - You'll need to set your device as discoverable. If you have `bluetoothctl` installed, it's usually as simple as running `bluetoothctl discoverable on`
> 
> Should none of these fix the issue, open a Github Issue and send along the error you receive. 

Once you have your device connected, you're ready to connect to the ANCS!
```js
// Check if the device supports the ANCS
let supports = await device.isSupported();
if(supports) {
    // Set up listener for when notifications are received
    device.on("created", (notification) => {
        // Do whatever with your notification...
        // (Look below (ANCSNotification) to see what you can get!)
    });
    // Start listening to notification events
    try {
        await device.startListening();
    } catch(e) {
        console.error(e);
    }
} else {
    console.log("Device not supported");
}
```

> ![!NOTE]
> When you call .startListening(), notifying will be enabled. If this is the first time your iOS device connects, you'll receive a popup you need to accept. Your device may need to be unlocked and on the home screen to receive the prompt.

# Current Support

| Workflow stage | Support notes |
| ------------- | ------------- |
| Initial Bluetooth connection | ❎ Must be handled outside `ancs-js` |
| Enable interface notifying | ✅ This starts when `.startListening()` is used |
| Receive notification IDs | ✅ These are received after notifiying |
| Get notification attributes | ✅ **Partially!** Requests/receives this automatically |
| Fetch app attributes | ❎ Not currently supported.|

# API

## Class: ANCSClient
This class **extends EventEmitter**.

### Constructor
```js
let device = new ANCSClient(macaddress)
```
- `macaddress`: A string containing a MAC address, in the format `00:00:00:00:00:00`.

> ![!NOTE]
> You should aim to create one ANCSClient instance per device. Do not reuse this class for multiple devices!

### Properties
- `MACAddress`
  - A string containing the selected device MAC address.
- `notifications`
  - An object matching a `notificationID` to an `ANCSNotification` instance.
  - `device.notifications[notificationID]`

### Methods

There are no static methods on this class.

- `.isSupported()` 
  - Checks to see if the device has the interfaces available that make up the ANCS.
  - Returns a **promise** resolving to a **boolean** (`true` if supported, `false` otherwise).
- `.startListening()`
  - Starts receiving notifications. 
  - Returns a **promise** resolving to a **boolean** (`true` if started successfully, `false` otherwise).
- `.stopListening()`
  - Stops receiving notifications
  - Returns a **promise** resolving to a **boolean** (`true` if stopped successfully, `false` otherwise).

### Events
- `start`
  - Fired when the client starts listening to the device notifications successfully
  - Callback argument: `MACAddress` (A String that represents the device that you started listening to)
- `stop`
  - Fired when the client stops listening to device notifications successfully
  - Callback argument: `MACAddress` (A String that represents the device that just stopped listening)
- `created`
  - Fired when a new notification is created and sent via the ANCS
  - Callback argument: `notification` (An `ANCSNotification` instance containing details for this notification).
- `edited`
  - Fired when a new notification is changed or edited
  - Callback argument: `notification` (An `ANCSNotification` instance containing details for this notification).
- `removed`
  - Fired when a new notification is removed or cleared
  - Callback argument: `notificationid` (A `String` representing this notification's ID).

## Class: ANCSNotification

### Constructor
You should **not** attempt to construct a new instance of this class. This will be provided for you in the `ANCSClient` events or `ANCSClient.notifications` property.

### Properties
- `title`
  - A string including the notification title
- `subtitle`
  - A string including the notification subtitle. **Often also null or an empty string**.
- `body`
  - The main notification content
- `date`
  - The time when the notification was sent as a `Date` object.
- `appID`
  - The ID of the app that sent the notification
- `id`
  - The unique ID of the notification, as a hex string.
- `raw`
  - The raw bytes received from the ANCS GetNotificationAttributes command, as a `Buffer` object.

### Methods
There are no static methods in this class.

- `toReadableString(separator)`
  - A quick-access human readable string of this notification.
  - `separator`: An optional string put between each part of the notification. Uses `\n` if not provided
  - Returns a **string** containing the human-readable version of the notification
- `toString(encoding)`
  - Converts a notification's data (as it was received from the ANCS GetNotificationAttributes command) into a machine-readable string.
  - `encoding`: A BufferEncoding string option (`hex` is the default).
  - Returns a **string** containing the machine-readable version of the notification
- `getAppFromId()`
  - **Experimental. Do NOT use!** This method has not been implemented yet.

## Licensing

This library is licensed under the MIT License. See LICENSE file for details.
