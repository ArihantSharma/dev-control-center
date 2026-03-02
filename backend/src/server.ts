import express, { Request, Response } from "express";
import Docker from "dockerode";
import http from "http";
import { WebSocketServer } from "ws";
import os from "os";
import cors from "cors";

const app = express();
app.use(cors());
const docker = new Docker();

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

/* REST endpoint (already working) */
app.get("/containers", async (_req: Request, res: Response) => {
    try {
        const containers = await docker.listContainers({ all: true });

        const formatted = containers.map((container) => ({
            id: container.Id,
            name: container.Names[0]?.replace("/", ""),
            image: container.Image,
            state: container.State,
            status: container.Status,
        }));

        res.json(formatted);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to fetch containers" });
    }
});

app.post("/containers/:id/start", async (req: Request, res: Response) => {
    try {
        const id = req.params.id as string;

        const container = docker.getContainer(id);
        await container.start();

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: "Failed to start container" });
    }
});

app.post("/containers/:id/stop", async (req: Request, res: Response) => {
    try {
        const id = req.params.id as string;

        const container = docker.getContainer(id);
        await container.stop();

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: "Failed to stop container" });
    }
});

app.get("/containers/:id/logs", async (req: Request, res: Response) => {
    try {
        const id = req.params.id as string;
        const container = docker.getContainer(id);

        const logs = await container.logs({
            stdout: true,
            stderr: true,
            tail: 50,
        });

        res.send(logs.toString());
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch logs" });
    }
});

/* WebSocket connection */
wss.on("connection", (ws, req) => {
    const url = req.url || "/";

    console.log("WS connected:", url);

    /* -----------------------------
       LOG STREAM ROUTE
    --------------------------------*/
    if (url.startsWith("/logs/")) {
        const containerId = url.split("/logs/")[1];

        const container = docker.getContainer(containerId);

        container.logs(
            {
                follow: true,
                stdout: true,
                stderr: true,
                tail: 50,
            },
            (err, stream) => {
                if (err || !stream) {
                    ws.send("Error streaming logs");
                    ws.close();
                    return;
                }

                stream.on("data", (chunk: Buffer) => {
                    ws.send(chunk.toString());
                });

                ws.on("close", () => {
                    stream.removeAllListeners()
                    if ("destroy" in stream) {
                        (stream as any).destroy()
                    }
                });
            }
        );

        return;
    }

    /* -----------------------------
       SYSTEM STATS ROUTE
    --------------------------------*/
    const interval = setInterval(() => {
        const totalMem = os.totalmem();
        const freeMem = os.freemem();
        const usedMem = totalMem - freeMem;

        const memoryUsage = ((usedMem / totalMem) * 100).toFixed(2);
        const cpuLoad = os.loadavg()[0];

        ws.send(
            JSON.stringify({
                type: "system-stats",
                cpuLoad,
                memoryUsage,
                totalMem,
                freeMem,
            })
        );
    }, 2000);

    ws.on("close", () => {
        clearInterval(interval);
        console.log("WS disconnected:", url);
    });
});

server.listen(4000, () => {
    console.log("Server running on http://localhost:4000");
});