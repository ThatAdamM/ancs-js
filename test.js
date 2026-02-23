console.log("Beginning tests. See the README for more info on running these successfully.");
console.log("Testing for device ", process.env.ADDRESS);
let { ANCSClient, ANCSNotification } = require("./");
let client = new ANCSClient(process.env.ADDRESS);

console.log("[+] MAC Address Valid");
client.on("start", (mac) => {
    console.log("[+] Started Listening to", mac);
});
client.on("stop", (mac) => {
    console.log("[+] Stopped Listening to", mac);
});
client.on("created", (noti) => {
    console.log("[+] Notification received");
    console.log(noti.toReadableString());
});
client.on("edited", (noti) => {
    console.log("[+] Notification edited");
    console.log(noti.toReadableString());
});
client.on("removed", (noti) => {
    console.log("[+] Notification removed");
    console.log("Removed ID", noti);
    console.log("[+] Successfully stopped. Exiting...")
    process.exit(0);
});

client.stopListening().then(() => {
    client.startListening().then((result) => {
        if (result) console.log(process.env.ADDRESS);
        else console.log("[-] Failed to start listening");
    });
});