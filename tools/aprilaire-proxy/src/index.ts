import net from 'node:net';

const servers = new Map<number, net.Server>();

const thermostats = new Map<string, net.Socket>();
thermostats.set("10.10.0.23", connect("10.10.0.23"));
thermostats.set("10.10.0.24", connect("10.10.0.24"));

const map = new Map<number, string>();
map.set(8001, "10.10.0.23");
map.set(8002, "10.10.0.24");

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
            console.log(`${clientAddress} <- ${thermostatAddress}: ${data.byteLength} bytes sent to client`);
            self.client.write(data);
        };
        
        this.writeToThermostat = (data: Buffer) => {
            console.log(`${clientAddress} -> ${thermostatAddress}: ${data.byteLength} bytes sent to thermostat`);
            self.thermostat.write(data);
        };

        this.endToClient = () => {
            console.log(`${clientAddress} <- ${thermostatAddress}: thermostat disconnected`);
            self.client.end();
        };

        this.thermostat.on("data", this.writeToClient);
        this.client.on("data", this.writeToThermostat);
        this.thermostat.on("end", this.endToClient);

        console.log(`${clientAddress} <> ${thermostatAddress}: connected`);
    }

    disconnect() {
        const clientAddress = this.client.remoteAddress;
        const thermostatAddress = this.thermostat.remoteAddress;

        this.thermostat.off("data", this.writeToClient);
        this.client.off("data", this.writeToThermostat);
        this.thermostat.off("end", this.endToClient);

        console.log(`${clientAddress} !! ${thermostatAddress}: disconnected`);

        this.client.removeAllListeners();
        this.client.end();
        this.client.destroy();
    }
}

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
        const thermostatAddress = thermostat.remoteAddress;

        if (thermostat.readyState === "closed" || thermostatAddress === undefined) {
            thermostats.delete(host);

            console.log(`${host}: disconnected please reconnect to try again`);
            client.destroy();
            return;
        }

        const clientAddress = client.remoteAddress;
        const proxy = new AprilaireProxy(client, thermostat);

        proxy.connect();

        client.on("error", (err: Error) => {
            console.log(`${clientAddress} error ${err}`);
        });

        client.on("end", () => {
            console.log(`${clientAddress} -> ${thermostatAddress}: client disconnected`);
            proxy.disconnect();
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