const mqtt = require('mqtt');
console.log("Connecting to MQTT broker at 10.240.165.253...");
const client = mqtt.connect('mqtt://10.240.165.253:1883', { connectTimeout: 5000 });

client.on('connect', () => {
    console.log("Connected! Listening for messages from the ESP8266 (topic: potato/node/#) ...");
    client.subscribe('potato/node/#');
});

client.on('message', (topic, message) => {
    console.log(`\n✅ DATA RECEIVED [${new Date().toISOString()}] on ${topic}:`);
    console.log(message.toString());
});

client.on('error', (err) => {
    console.error("\n❌ MQTT Connection Error:", err.message);
    process.exit(1);
});

// Run for 15 seconds to catch at least 5 to 7 sensor reading loops from ESP8266
setTimeout(() => {
    console.log("\nFinished listening.");
    process.exit(0);
}, 15000);
