import net from 'node:net';

const servers = new Map<number, net.Server>();
const thermostats = new Map<string, net.Socket>();

const map = new Map<number, string>();
map.set(8001, "10.10.0.23");
map.set(8002, "10.10.0.24");

const cosSubscription = Buffer.alloc(37, "AQUAIAEHAQEAAAAAAQEBAQEBAAEAAQEBAAABAQABAQEBAQEAlQ==", "base64");

function connect(host: string) : net.Socket {
    if (thermostats.has(host)) {
        return thermostats.get(host)!;
    }

    const thermostat = new net.Socket();

    thermostat.on("error", (err: Error) => {
        console.log(`${host} error ${err}`);
    });

    thermostat.on("ready", () => { 
        console.log(`${host} connected`);
    });

    thermostat.on("end", () => {
        console.log(`${host} disconnected`);
        thermostats.delete(host);
    });

    thermostat.on("data", (data: Buffer) => {
        console.log(`${host} data ${data.byteLength} bytes received`);
    });

    thermostat.connect({ host: host, port: 8000, keepAlive: true });
    thermostats.set(host, thermostat);
    return thermostat;
}

for (let i of map) {
    const port = i[0];
    const host = i[1];
    const server = net.createServer({ keepAlive: true }, client => {
        console.log(`${port} -> ${host} connected`);
        const thermostat = connect(host);

        client.pipe(thermostat, { end: false });
        thermostat.pipe(client, { end: true });

        /*
        client.on("data", (data: Buffer) => {
            console.log(`${port} -> ${host}: ${data.byteLength} bytes received`);
            thermostat.write(data);
        });

        client.on("end", () => {
            console.log(`${port} -> ${host}: end`);
        });

        thermostat.on("data", (data: Buffer) => {
            console.log(`${host} -> ${port}: ${data.byteLength} bytes received`);
            client.write(data);
        });
    
        thermostat.on("end", () => {
            console.log(`${host} -> ${port}: end`);
            client.end();
        });
        */
    });

    server.on("close", (hadError: boolean) => {
        console.log(`${port} close ${hadError ? "with error" : ""}`);
    });

    server.on("error", (err: Error) => {
        console.log(`${port} error ${err}`);
    });

    server.listen(port, () => {
        console.log(`${port} listening`);
    });
    
    servers.set(port, server);
}