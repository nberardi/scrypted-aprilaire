import net from 'node:net';

const ports: number[] = [8001,8002,8003,8004];
const servers = new Map<number, net.Server>();

const thermostats: string[] = ["10.10.0.23", "10.10.0.24"];
const sockets = new Map<string, net.Socket>();

const map = new Map<string, number[]>();

map.set("10.10.0.23", [8001, 8002]);
map.set("10.10.0.24", [8003, 8004]);

for (const port in ports) {
    const server = net.createServer(c => {
        console.log("server connected");

        c.on("close", (hadError: boolean) => {
            console.log(`${port} close ${hadError ? "with error" : ""}`);
        });

        c.on("error", (err: Error) => {
            console.log(`${port} error ${err}`);
        });

        c.on("ready", () => {
            console.log(`${port} ready`);
        });
    });

    server.listen(port, () => {

    });

    servers.set(port, server);
}

for (const host in thermostats) {
    const client = net.createConnection(8000, host);

    client.on("close", (hadError: boolean) => {
        console.log(`${host} close ${hadError ? "with error" : ""}`);
    });

    client.on("error", (err: Error) => {
        console.log(`${host} error ${err}`);
    });

    client.on("ready", () => { 
        console.log(`${host} ready`);
    });

    sockets.set(host, client);
}

// cross map
for (const host in thermostats) {
    const ports = map[host];
    const socket = sockets[host];

    for (const port in ports) {
        const server = servers[port];

        socket.on("data", (data: Buffer) => {
            server.write(data);
        });

        server.on("data", (data: Buffer) => {
            socket.write(data);
        });
    }
}