"""Discover Tripo's authenticated capability matrix via the registered Codex MCP server."""
import itertools
import json
from pathlib import Path
import subprocess
import sys


def inspect(process):
    sequence = itertools.count(1)

    def send(request):
        process.stdin.write(json.dumps(request) + "\n")
        process.stdin.flush()

    def ask(method, params):
        request_id = next(sequence)
        send({"id": request_id, "method": method, "params": params})
        for line in process.stdout:
            message = json.loads(line)
            if message.get("id") == request_id and "result" in message:
                return message["result"]
            if message.get("id") == request_id and "error" in message:
                raise RuntimeError(f"Codex failed to complete {method}")
        raise RuntimeError("Codex closed its MCP connection")

    ask("initialize", {"clientInfo": {"name": "aetheria_inventory", "version": "1.0"},
                       "capabilities": {"experimentalApi": True}})
    send({"method": "initialized"})
    thread = ask("thread/start", {"cwd": str(Path.cwd()), "ephemeral": True, "approvalPolicy": "never"})["thread"]["id"]
    rows = ask("mcpServerStatus/list", {"threadId": thread, "serverName": "tripo", "detail": "toolsAndAuthOnly"})["data"]
    server, = [row for row in rows if row["name"] == "tripo"]
    tools = server["tools"]
    if not tools:
        raise RuntimeError("No Tripo tools discovered. Check registration and OAuth.")
    return {"authentication": server["authStatus"], "tools": sorted(tools),
            "generationModels": {name: tool["inputSchema"]["properties"]["model_version"].get("enum", [])
                                 for name, tool in tools.items() if "model_version" in tool["inputSchema"].get("properties", {})}}


if __name__ == "__main__":
    with subprocess.Popen(["codex", "app-server", "--listen", "stdio://"], stdin=subprocess.PIPE,
                          stdout=subprocess.PIPE, stderr=sys.stderr, text=True) as process:
        try:
            print(json.dumps(inspect(process), indent=2))
        finally:
            process.terminate()
