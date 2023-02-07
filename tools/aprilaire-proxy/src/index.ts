import net from 'node:net';

const servers = new Map<number, net.Server>();

const thermostats = new Map<string, net.Socket>();
thermostats.set("10.10.0.23", connectToThermostat("10.10.0.23"));
thermostats.set("10.10.0.24", connectToThermostat("10.10.0.24"));

const map = new Map<number, string>();
map.set(8001, "10.10.0.23");
map.set(8002, "10.10.0.24");

function log(message: string) {
    console.log(`[${new Date().toISOString()}] ${message}`);
}

class AprilaireProxy {
    client: net.Socket;
    thermostat: net.Socket;

    writeToClient: (data: Buffer) => void;
    writeToThermostat: (data: Buffer) => void;
    endToClient: () => void;

    constructor(client: net.Socket, thermostat: net.Socket) {
        this.client = client;
        this.thermostat = thermostat;
    }

    public connect() {
        const clientAddress = this.client.remoteAddress;
        const thermostatAddress = this.thermostat.remoteAddress;
        const self = this;

        this.writeToClient = (data: Buffer) => {
            log(`${clientAddress} <- ${thermostatAddress}: ${data.byteLength} bytes sent to client`);
            self.client.write(data);
        };
        
        this.writeToThermostat = (data: Buffer) => {
            log(`${clientAddress} -> ${thermostatAddress}: ${data.byteLength} bytes sent to thermostat`);
            self.thermostat.write(data);
        };

        this.endToClient = () => {
            log(`${clientAddress} <- ${thermostatAddress}: thermostat disconnected`);
            self.client.end();
        };

        this.thermostat.on("data", this.writeToClient);
        this.client.on("data", this.writeToThermostat);
        this.thermostat.on("end", this.endToClient);

        log(`${clientAddress} <> ${thermostatAddress}: connected`);
    }

    disconnect() {
        const clientAddress = this.client.remoteAddress;
        const thermostatAddress = this.thermostat.remoteAddress;

        this.thermostat.off("data", this.writeToClient);
        this.client.off("data", this.writeToThermostat);
        this.thermostat.off("end", this.endToClient);

        log(`${clientAddress} !! ${thermostatAddress}: disconnected`);

        this.client.removeAllListeners();
        this.client.end();
        this.client.destroy();
    }
}

const clients = new Map<string, AprilaireProxy>();
const clientsLastConnected = new Map<string, Date>();

function connectToThermostat(host: string) : net.Socket {
    if (thermostats.has(host)) {
        return thermostats.get(host)!;
    }

    const thermostat = new net.Socket();

    thermostat.on("end", () => {
        log(`${host} disconnected`);
        thermostats.delete(host);
    });

    thermostat.on("error", (err: Error) => {
        log(`${host} error ${err}`);
    });

    thermostat.connect({ host: host, port: 8000, keepAlive: true }, () => {
        log(`${host} connected`);
    });

    thermostats.set(host, thermostat);
    return thermostat;
}

function clientConnected (client: net.Socket) {
    const port = client.localPort;
    const host = map.get(port);

    const clientAddress = client.remoteAddress;

    // If the client is not connected, we can't do anything
    if (client.readyState === "closed" || clientAddress === undefined) {
        log(`${clientAddress} disconnected`);
        client.destroy();
        return;
    }

    const clientKey = `${clientAddress}:${host}`;

    // If the client is already connected, we can't do anything
    if(clients.has(clientKey)) {
        log(`${clientAddress} already connected, only 1 connection allowed`);
        client.destroy();
        return;
    }

    // If the client is connecting too fast, we can't do anything
    if (clientsLastConnected.has(clientKey)) {
        const lastConnected = clientsLastConnected.get(clientKey);
        const now = new Date();

        if (now.getTime() - lastConnected!.getTime() < 1000) {
            log(`${clientAddress} too many connections, please wait 1 second before trying again`);
            client.destroy();
            return;
        }
    }

    clientsLastConnected.set(clientKey, new Date());

    const thermostat = connectToThermostat(host);
    const thermostatAddress = thermostat.remoteAddress;

    // If the thermostat is not connected, we can't do anything
    if (thermostat.readyState === "closed" || thermostatAddress === undefined) {
        thermostats.delete(host);

        log(`${host}: disconnected please reconnect to try again`);
        client.destroy();
        return;
    }

    // Create a proxy to handle the client and thermostat
    const proxy = new AprilaireProxy(client, thermostat);

    // Connect the proxy
    proxy.connect();

    // Add the proxy to the list of clients in case the client is misbehaving with multiple attempts
    clients.set(clientKey, proxy);

    client.on("error", (err: Error) => {
        log(`${clientAddress} error ${err}`);
    });

    client.on("end", () => {
        log(`${clientAddress} -> ${thermostatAddress}: client disconnected`);
        proxy.disconnect();
        clients.delete(clientKey);
    });
}

for (let i of map) {
    const port = i[0];
    const host = i[1];
    const server = net.createServer({ keepAlive: true }, clientConnected);

    server.on("close", (hadError: boolean) => {
        log(`${port} close ${hadError ? "with error" : ""}`);
    });

    server.on("error", (err: Error) => {
        log(`${port} error ${err}`);
    });

    server.listen(port, () => {
        log(`${port} listening for ${host}`);
    });
    
    servers.set(port, server);
}