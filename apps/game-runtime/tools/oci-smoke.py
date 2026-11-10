"""Owned disposable OCI smoke; no deployment or GPU qualification."""
import json
import re
import subprocess
import sys
import time
import urllib.error
import urllib.request
import uuid

assert len(sys.argv) == 2 and re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9./:@_-]+", sys.argv[1])
image = sys.argv[1]
name = "vl-runtime-smoke-" + uuid.uuid4().hex[:12]
facts = {"scope": "Local OCI foundation only; not hosted CI or gameplay readiness"}


def docker(*args, check=True):
    return subprocess.run(["docker", *args], check=check, capture_output=True, text=True, timeout=30)


def request(base, path, expected, method="GET"):
    try:
        response = urllib.request.urlopen(urllib.request.Request(base + path, method=method), timeout=3)
    except urllib.error.HTTPError as error:
        response = error
    with response:
        assert response.code == expected, (path, response.code, expected)
        return response.read(4096)


started = False
try:
    metadata = json.loads(docker("image", "inspect", image).stdout)[0]
    assert metadata["Config"]["User"] == "65532:65532"
    facts["imageId"] = metadata["Id"]
    facts["sourceRevision"] = metadata["Config"]["Labels"]["org.opencontainers.image.revision"]
    docker("run", "-d", "--name", name, "--read-only", "--cap-drop=ALL", "--security-opt=no-new-privileges",
           "--pids-limit=64", "--memory=128m", "-p", "127.0.0.1::4400", image)
    started = True
    deadline = time.monotonic() + 20
    while True:
        container = json.loads(docker("inspect", name).stdout)[0]
        if container["State"].get("Health", {}).get("Status") == "healthy":
            break
        assert container["State"]["Running"] and time.monotonic() < deadline, "Container did not become live"
        time.sleep(0.2)
    mapping = container["NetworkSettings"]["Ports"]["4400/tcp"]
    assert len(mapping) == 1 and mapping[0]["HostIp"] == "127.0.0.1"
    base = "http://127.0.0.1:" + mapping[0]["HostPort"]
    live = json.loads(request(base, "/health/live", 200))
    ready = json.loads(request(base, "/health/ready", 503))
    assert live["gameplayEnabled"] is False and ready["reason"] == "GAMEPLAY_NOT_IMPLEMENTED"
    request(base, "/rt/v1", 404)
    request(base, "/health/live", 405, "POST")
    docker("exec", name, "/usr/local/bin/vl-game-runtime", "--healthcheck")
    negative = docker("run", "--rm", "--network=none", "--read-only", "--cap-drop=ALL",
                      "--security-opt=no-new-privileges", "-e", "VL_GAMEPLAY_ENABLED=1", image, check=False)
    assert negative.returncode != 0, "Unexpected gameplay activation"
    docker("stop", "--time=5", name)
    stopped = json.loads(docker("inspect", name).stdout)[0]["State"]
    assert stopped["ExitCode"] == 0 and stopped["Running"] is False
    facts.update(result="PASS", nonroot=True, readOnly=True, liveness=200, readiness=503,
                 gameRoute=404, wrongMethod=405, gameplayActivationRejected=True, gracefulExitCode=0)
finally:
    if started:
        docker("rm", "-f", name)
    facts["ownedContainerCleanupComplete"] = True
    print(json.dumps(facts, indent=2))
