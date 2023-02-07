import net from 'node:net';

const servers = new Map<number, net.Server>();

const thermostats = new Map<string, net.Socket>();
thermostats.set("10.10.0.23", connect("10.10.0.23"));
thermostats.set("10.10.0.24", connect("10.10.0.24"));

const map = new Map<number, string>();
map.set(8001, "10.10.0.23");
map.set(8002, "10.10.0.24");

function connect(host: string) : net.Socket {
    if (thermostats.has(host)) {
        return thermostats.get(host)!;
    }

    const thermostat = new net.Socket();

    thermostat.on("close", (hadError: boolean) => {
        console.log(`${host} disconnected ${hadError ? "with error" : ""}`);
        thermostats.delete(host);
    });

    thermostat.on("error", (err: Error) => {
        console.log(`${host} error ${err}`);
    });

    thermostat.connect({ host: host, port: 8000, keepAlive: true }, () => {
        console.log(`${host} connected`);
    });

    thermostats.set(host, thermostat);
    return thermostat;
}

for (let i of map) {
    const port = i[0];
    const host = i[1];
    const server = net.createServer({ keepAlive: true }, client => {
        const thermostat = connect(host);

        const clientAddress = client.remoteAddress;
        const thermostatAddress = thermostat.remoteAddress;

        console.log(`${clientAddress} <> ${thermostatAddress}: connected`);

        thermostat.pipe(client, { end: true });
        thermostat.on("data", (data: Buffer) => {
            console.log(`${clientAddress} <- ${thermostatAddress}: ${data.byteLength} bytes sent to client`);
        });

        client.pipe(thermostat, { end: false });
        client.on("data", (data: Buffer) => {
            console.log(`${clientAddress} -> ${thermostatAddress}: ${data.byteLength} bytes sent to thermostat`);
        });

        client.on("close", (hadError: boolean) => {
            console.log(`${clientAddress} !! ${thermostatAddress}: disconnected ${hadError ? "with error" : ""}`);
        });
    
    });

    server.on("close", (hadError: boolean) => {
        console.log(`${port} close ${hadError ? "with error" : ""}`);
    });

    server.on("error", (err: Error) => {
        console.log(`${port} error ${err}`);
    });

    server.listen(port, () => {
        console.log(`${port} listening for ${host}`);
    });
    
    servers.set(port, server);
}