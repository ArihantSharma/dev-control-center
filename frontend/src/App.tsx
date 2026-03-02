import { useEffect, useState, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { useRef } from "react"

interface Container {
    id: string
    name: string
    image: string
    state: string
    status: string
}

export default function App() {
    const [logSocket, setLogSocket] = useState<WebSocket | null>(null)
    const [status, setStatus] = useState("Connecting...")
    const [cpu, setCpu] = useState(0)
    const [memory, setMemory] = useState("0")
    const [containers, setContainers] = useState<Container[]>([])
    const [selectedContainer, setSelectedContainer] = useState<string | null>(null)
    const [logs, setLogs] = useState("")


    const logEndRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        logEndRef.current?.scrollIntoView({ behavior: "smooth" })
    }, [logs])
    useEffect(() => {
        fetchContainers()

        const interval = setInterval(fetchContainers, 3000)

        const socket = new WebSocket("ws://localhost:4000")

        socket.onopen = () => setStatus("Connected")

        socket.onmessage = (event) => {
            const data = JSON.parse(event.data)
            if (data.type === "system-stats") {
                setCpu(data.cpuLoad)
                setMemory(data.memoryUsage)
            }
        }

        socket.onclose = () => setStatus("Reconnecting...")

        return () => {
            clearInterval(interval)
            socket.close()
            if (logSocket) logSocket.close()
        }
    }, [])

    const fetchContainers = useCallback(async () => {
        const res = await fetch("http://localhost:4000/containers")
        const data = await res.json()
        setContainers(data)
    }, [])

    const startLogStream = (containerId: string) => {
        // Close previous stream
        if (logSocket) {
            logSocket.close()
        }

        setLogs("")

        const socket = new WebSocket(
            `ws://localhost:4000/logs/${containerId}`
        )

        socket.onmessage = (event) => {
            setLogs((prev) => {
                const updated = prev + event.data
                return updated.length > 50000
                    ? updated.slice(updated.length - 50000)
                    : updated
            })
        }

        socket.onclose = () => {
            console.log("Log stream closed")
        }

        setLogSocket(socket)
    }

    const startContainer = async (id: string) => {
        await fetch(`http://localhost:4000/containers/${id}/start`, { method: "POST" })
        fetchContainers()
    }

    const stopContainer = async (id: string) => {
        await fetch(`http://localhost:4000/containers/${id}/stop`, { method: "POST" })
        fetchContainers()
    }

    return (
        <div className="min-h-screen bg-background text-foreground p-8">
            <h1 className="text-3xl font-bold mb-2">Dev Control Center</h1>
            <p className="text-muted-foreground text-sm mb-6">Status: {status}</p>

            {/* Metrics */}
            <div className="grid grid-cols-2 gap-6 max-w-lg mb-8">
                <Card>
                    <CardHeader>
                        <CardTitle className="text-sm">CPU Load</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-2xl font-bold">{cpu}</p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="text-sm">Memory Usage</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-2xl font-bold">{memory}%</p>
                    </CardContent>
                </Card>
            </div>

            <Separator className="mb-6" />

            {/* Main Split Layout */}
            <div className="grid grid-cols-3 gap-6">
                {/* LEFT - Containers */}
                <div className="col-span-1 space-y-4">
                    <h2 className="text-xl font-semibold mb-2">Containers</h2>

                    <div className="space-y-3 max-h-[65vh] overflow-y-auto pr-2">
                        {containers.map((container) => (
                            <Card
                                key={container.id}
                                className="cursor-pointer hover:bg-muted/50 transition"
                                onClick={() => {
                                    setSelectedContainer(container.id)
                                    startLogStream(container.id)
                                }}
                            >
                                <CardContent className="flex justify-between items-center p-4">
                                    <div>
                                        <p className="font-semibold">{container.name}</p>
                                        <Badge
                                            variant={container.state === "running" ? "default" : "secondary"}
                                            className="mt-2"
                                        >
                                            {container.state}
                                        </Badge>
                                    </div>

                                    {container.state === "running" ? (
                                        <Button
                                            size="sm"
                                            variant="destructive"
                                            onClick={(e) => {
                                                e.stopPropagation()
                                                stopContainer(container.id)
                                            }}
                                        >
                                            Stop
                                        </Button>
                                    ) : (
                                        <Button
                                            size="sm"
                                            onClick={(e) => {
                                                e.stopPropagation()
                                                startContainer(container.id)
                                            }}
                                        >
                                            Start
                                        </Button>
                                    )}
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                </div>

                {/* RIGHT - Logs */}
                <div className="col-span-2">
                    <Card className="h-[65vh] flex flex-col">
                        <CardHeader>
                            <CardTitle>Logs</CardTitle>
                        </CardHeader>
                        <CardContent className="flex-1">
                            <ScrollArea className="h-full rounded-md border p-4 bg-black text-green-400 text-xs font-mono">
                                <pre>{logs || "Select a container to view logs..."}</pre>
                                <div ref={logEndRef} />
                            </ScrollArea>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    )
}