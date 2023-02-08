import net from 'node:net';

const LOG = process.env.LOG;

const servers = new Map<number, net.Server>();

const map = new Map<number, string>();
map.set(8001, "10.10.0.23");
map.set(8002, "10.10.0.24");

const clientLastConnected = new Map<string, Date>();
const clients = new Map<string, AprilaireProxy>();

const thermostatLastConnected = new Map<string, Date>();
const thermostats = new Map<string, net.Socket>();

function debug(message: string) {
    if (LOG === "debug") {
        console.debug(`[${new Date().toISOString()}] ${message}`);
    }
}

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

function initializeThermostat(thermostat: net.Socket) {
    const host = thermostat.remoteAddress;

    // remove all the listeners that were added to satisfy the connection promise
    thermostat.removeAllListeners();

    thermostat.on("close", (hasError: boolean) => {
        log(`thermostat ${host} disconnected`);
        thermostats.delete(host);
    });

    thermostat.on("error", (err: Error) => {
        log(`thermostat ${host} error ${err}`);
    });

    thermostats.set(host, thermostat);
}

function connectToThermostat(host: string) : Promise<net.Socket | undefined> {
    if (thermostats.has(host)) {
        return Promise.resolve(thermostats.get(host));
    }

    // If too many connection attempts are coming in for a single host, reject the request to prevent flooding
    if (thermostatLastConnected.has(host)) {
        const lastConnected = thermostatLastConnected.get(host);
        const now = new Date();

        if (now.getTime() - lastConnected!.getTime() < 10000) {
            debug(`${host}: too many connections, wait 10 seconds before trying again`);
            return Promise.reject(new Error("too many connections, wait 10 seconds before trying again"));
        }
    }

    thermostatLastConnected.set(host, new Date());

    return new Promise<net.Socket>((resolve, reject) => {

        const thermostat = new net.Socket();

        thermostat.once("ready", () => {
            log(`thermostat ${host} connected`);
            initializeThermostat(thermostat);
            resolve(thermostat);
        });

        thermostat.once("end", () => {
            debug(`thermostat ${host} disconnected during connection`);
            thermostat.destroy();
            reject(new Error("disconnected prematurely"));
        });

        thermostat.once("close", () => {
            debug(`thermostat ${host} disconnected during connection`);
            thermostat.destroy();
            reject(new Error("disconnected prematurely"));
        });

        thermostat.once("error", (err: Error) => {
            debug(`thermostat ${host} errored during connection: ${err}`);
            thermostat.destroy();
            reject(err);
        });

        thermostat.connect({ host: host, port: 8000 }, () => {
            debug(`thermostat ${host} connecting`);
        });

        setTimeout(() => {
            debug(`thermostat ${host} connection timed out during connection`);
            thermostat.destroy();
            reject(new Error("connection timed out"));
        }, 5000);
    });
}

async function clientConnected (client: net.Socket) {
    const port = client.localPort;
    const host = map.get(port)!;

    const clientAddress = client?.remoteAddress;

    // If the client is not connected, we can't do anything
    if (client === undefined || clientAddress === undefined || client.readyState !== "open") {
        log(`client ${clientAddress} connection is ${client?.readyState}, cannot connect to ${host}`);
        client.destroy();
        return;
    }

    const clientKey = `${clientAddress}:${host}`;

    // If the client is already connected, we can't do anything
    if(clients.has(clientKey)) {
        log(`${clientAddress} -> ${host}: already connected, only 1 connection allowed`);
        client.destroy();
        return;
    }

    // If the client is connecting too fast, reject the request to prevent flooding
    if (clientLastConnected.has(clientKey)) {
        const lastConnected = clientLastConnected.get(clientKey);
        const now = new Date();

        if (now.getTime() - lastConnected!.getTime() < 5000) {
            debug(`${clientAddress} -> ${host}: too many connections, please wait 5 seconds before trying again`);
            client.destroy();
            return;
        }
    }

    clientLastConnected.set(clientKey, new Date());

    const thermostat = await connectToThermostat(host).catch((err) => {
        log(`thermostat ${host} error ${err}`);
        return undefined;
    });
    const thermostatAddress = thermostat?.remoteAddress;

    // If the thermostat is not connected, we can't do anything
    if (thermostat === undefined || thermostatAddress === undefined || (thermostat.readyState !== "open" && thermostat.readyState !== "opening")) {
        log(`thermostat ${host} connection is ${thermostat?.readyState}, cannot proxy for ${port}`);
        thermostats.delete(host);
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
        log(`client ${clientAddress} error ${err}`);
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
        log(`server ${port} close ${hadError ? "with error" : ""}`);
    });

    server.on("error", (err: Error) => {
        log(`server ${port} error ${err}`);
    });

    server.listen(port, () => {
        log(`server ${port} listening for ${host}`);
    });
    
    servers.set(port, server);
}