# Project 17 — Infrastructure Monitoring with Prometheus, Grafana, and Node.js

## Overview

This project sets up a containerised monitoring stack on AWS EC2 using Prometheus, Grafana, and Node Exporter. A custom Node.js application exposes application-level metrics via the `prom-client` library, which Prometheus scrapes alongside Linux system metrics from Node Exporter. Grafana visualises both.

This is a continuation of the StegHub DevOps project series, building on the IaC and CI/CD foundations from earlier labs.

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                  EC2 t3.medium (Ubuntu 22.04)        │
│                                                     │
│  ┌─────────────┐     scrapes     ┌───────────────┐  │
│  │  Prometheus │ ──────────────► │  Node.js App  │  │
│  │  :9090      │                 │  :3001        │  │
│  │             │ ──────────────► │  /metrics     │  │
│  │             │     scrapes     └───────────────┘  │
│  │             │                                    │
│  │             │ ──────────────► ┌───────────────┐  │
│  └──────┬──────┘     scrapes     │ Node Exporter │  │
│         │                        │  :9100        │  │
│         │ data source            └───────────────┘  │
│         ▼                                           │
│  ┌─────────────┐                                    │
│  │   Grafana   │                                    │
│  │   :3000     │                                    │
│  └─────────────┘                                    │
└─────────────────────────────────────────────────────┘
```

All four services run as Docker containers orchestrated with Docker Compose on a single EC2 instance.

---

## Stack

| Tool | Purpose |
|------|---------|
| AWS EC2 (t3.medium) | Host for all containers |
| Docker + Docker Compose | Container orchestration |
| Prometheus | Metrics collection and storage |
| Grafana | Metrics visualisation and dashboards |
| Node Exporter | Linux system metrics (CPU, memory, disk, network) |
| Node.js + Express | Sample application exposing custom metrics |
| prom-client | Prometheus metrics library for Node.js |

---

## Project Structure

```
monitoring-lab/
├── app/
│   ├── index.js          # Node.js app with /metrics endpoint
│   ├── package.json
│   └── Dockerfile
├── prometheus/
│   └── prometheus.yml    # Scrape configuration
└── docker-compose.yml    # All four services defined here
```

---

## How It Works

### Metrics flow

1. The Node.js app uses `prom-client` to expose a `/metrics` endpoint on port 3001
2. Node Exporter runs as a container and exposes Linux host metrics on port 9100
3. Prometheus scrapes both endpoints every 15 seconds and stores the time-series data
4. Grafana connects to Prometheus as a data source and renders dashboards

### Custom metrics in the Node.js app

The app tracks a custom counter `http_requests_total` with labels for `method`, `route`, and `status`. This means you can query Prometheus for request counts broken down by route — for example, how many times `/about` was hit versus `/`.

`prom-client` also collects default Node.js runtime metrics automatically: heap memory usage, event loop lag, garbage collection stats, and active handles.

---

## Prometheus Configuration

`prometheus/prometheus.yml` defines three scrape jobs:

```yaml
scrape_configs:
  - job_name: 'prometheus'       # Prometheus monitors itself
    static_configs:
      - targets: ['localhost:9090']

  - job_name: 'node-exporter'    # Linux system metrics
    static_configs:
      - targets: ['node-exporter:9100']

  - job_name: 'nodejs-app'       # Custom app metrics
    static_configs:
      - targets: ['nodejs-app:3001']
```

Container names are used as hostnames because all services share the same Docker Compose network.

---

## Grafana Dashboards

### Node Exporter Full (Dashboard ID: 1860)

Imported from Grafana's community dashboard library. Shows:
- CPU usage per core
- Memory usage and available RAM
- Disk I/O and filesystem usage
- Network traffic in/out

### Custom Node.js Dashboard

Built manually using PromQL queries:
- `http_requests_total` — total requests over time, broken down by route
- Visualised as a time series panel

---

## Security Group Configuration

| Port | Service | Access |
|------|---------|--------|
| 22 | SSH | My IP only |
| 3000 | Grafana | My IP only |
| 9090 | Prometheus | My IP only |
| 9100 | Node Exporter | My IP only |
| 3001 | Node.js app | My IP only |

All ports restricted to a single IP — no public exposure.

---

## Setup Instructions

### Prerequisites
- AWS account with EC2 access
- Key pair (.pem file)
- Local terminal

### 1. Launch EC2

- AMI: Ubuntu Server 22.04 LTS
- Instance type: t3.medium
- Configure security group as above

### 2. Install Docker

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
sudo usermod -aG docker ubuntu
newgrp docker
```

### 3. Clone or create the project structure

```bash
mkdir ~/monitoring-lab && cd ~/monitoring-lab
mkdir app prometheus
```

Create the files as shown in the project structure above.

### 4. Start the stack

```bash
docker compose up -d --build
```

### 5. Verify

```bash
docker compose ps   # All 4 containers should show Up
```

Access:
- Node.js app: `http://<ec2-ip>:3001`
- App metrics: `http://<ec2-ip>:3001/metrics`
- Prometheus: `http://<ec2-ip>:9090` → Status → Targets (all 3 should show UP)
- Grafana: `http://<ec2-ip>:3000` (admin / admin123)

### 6. Generate test traffic

```bash
for i in {1..20}; do curl http://localhost:3001; done
for i in {1..10}; do curl http://localhost:3001/about; done
```

Then query `http_requests_total` in Prometheus or view the Grafana dashboard.

---

## Key Concepts Learned

**Prometheus scraping model** — Prometheus pulls metrics from targets on a defined interval, rather than targets pushing data. This means targets need to expose an HTTP `/metrics` endpoint in the Prometheus text format.

**prom-client** — The official Node.js client library for Prometheus. Handles metric registration, default runtime metrics, and the `/metrics` endpoint response format automatically.

**Node Exporter** — A Prometheus exporter specifically for Linux host metrics. Runs as a process (or container) and translates OS-level stats into Prometheus-readable format.

**Docker Compose networking** — All services defined in the same `docker-compose.yml` share a default bridge network. Container names resolve as hostnames, which is why `prometheus.yml` uses `node-exporter:9100` rather than `localhost:9100`.

**PromQL basics** — Prometheus Query Language used to query metrics. `http_requests_total` returns the raw counter; `rate(http_requests_total[5m])` calculates requests per second over a 5-minute window.

---

## Teardown

```bash
docker compose down -v   # Stops containers and removes volumes
```

Terminate the EC2 instance from the AWS console to stop billing.

---

## Related Projects

- [Project 15 — AWS Multi-Tier Architecture with NGINX Reverse Proxy](../Project-15-AWS-Cloud-Solution-For-2-Company-Websites-Using-A-Reverse-Proxy)
- [Project 16 — Terraform IaC: AWS VPC and Subnet Automation](../Project-16-Automate-Infrastructure-With-IaC-using-Terraform-1)

---

## Author

Lydiah Nganga  
Cloud & DevOps Engineering — StegHub Academy  
[GitHub](https://github.com/) · [LinkedIn](https://linkedin.com/in/)# Monitoring With Prometheus and Grafana

