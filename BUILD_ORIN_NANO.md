# V4L2 Viewer on Jetson Orin Nano

This guide covers two methods: building natively or using Docker.

---

# Method A: Native Build

## Prerequisites

- NVIDIA Jetson Orin Nano with JetPack 6 installed
- Internet connection for installing packages

## 1. Install Dependencies

```bash
sudo apt update
sudo apt install -y \
  build-essential cmake git \
  qt6-base-dev libqt6opengl6-dev libqt6openglwidgets6 \
  qt6-webengine-dev qt6-webengine-dev-tools libqt6webenginecore6-bin \
  libqt6webchannel6-dev libqt6websockets6-dev \
  libgl1-mesa-dev libegl1-mesa-dev \
  libv4l-dev v4l-utils
```

> **Note:** If you don't need the web UI, you can skip `qt6-webengine-dev`,
> `qt6-webengine-dev-tools`, `libqt6webenginecore6-bin`, `libqt6webchannel6-dev`,
> and `libqt6websockets6-dev` to save disk space. Then pass `-DBUILD_WEB_UI=OFF`
> to cmake in step 2.

## 2. Clone and Build

```bash
git clone https://github.com/alliedvision/V4L2Viewer.git
cd V4L2Viewer
mkdir build && cd build
cmake .. -DCMAKE_BUILD_TYPE=Release -DSOFTWARE_RENDER_DEFAULT=OFF -DBUILD_WEB_UI=ON
make -j$(nproc)
```

### CMake Options

| Option | Default | Description |
|--------|---------|-------------|
| `CMAKE_BUILD_TYPE` | — | Set to `Release` for optimized build |
| `SOFTWARE_RENDER_DEFAULT` | `ON` | Set to `OFF` on Orin Nano (has GPU) |
| `BUILD_WEB_UI` | `ON` | Set to `OFF` to skip the web-based UI |

## 3. Run

```bash
# Classic widget UI
./V4L2Viewer

# Web-based UI
./V4L2Viewer --web
```

---

# Method B: Docker Container

## Prerequisites

- Docker installed on the Orin Nano (`sudo apt install docker.io`)
- NVIDIA Container Toolkit installed (ships with JetPack 6)
- A camera device available (e.g. `/dev/video0`)

## 1. Clone the Repository

```bash
git clone https://github.com/alliedvision/V4L2Viewer.git
cd V4L2Viewer
```

## 2. Build the Docker Image

Build directly on the Orin Nano:

```bash
sudo docker build -t v4l2-viewer .
```

This uses a two-stage Dockerfile — the first stage compiles the application, the
second stage creates a smaller runtime image without build tools.

> **Note:** The build pulls the `l4t-jetpack:r36.4.0` base image from NVIDIA NGC
> and installs Qt6 + WebEngine, so it may take a while on the first run.

## 3. Run the Container

### Option A: Using Docker Compose (recommended)

```bash
# Allow X11 forwarding
xhost +local:docker

# Start the container
sudo docker compose up
```

The `docker-compose.yml` is pre-configured with the correct device, display,
and NVIDIA runtime settings.

### Option B: Using Docker Run

```bash
# Allow X11 forwarding
xhost +local:docker

# Run the container
sudo docker run --rm -it \
  --device /dev/video0 \
  -e DISPLAY=$DISPLAY \
  -v /tmp/.X11-unix:/tmp/.X11-unix \
  --runtime nvidia \
  v4l2-viewer --web
```

### Docker Run Options

| Option | Description |
|--------|-------------|
| `--device /dev/video0` | Pass through the camera device (adjust as needed) |
| `-e DISPLAY=$DISPLAY` | Forward X11 display |
| `-v /tmp/.X11-unix:/tmp/.X11-unix` | Mount X11 socket for GUI |
| `--runtime nvidia` | Enable GPU acceleration |
| `--web` | Launch the web-based UI (default in Docker) |

> **Tip:** To use the classic widget UI instead, replace `--web` with no arguments:
> ```bash
> sudo docker run --rm -it \
>   --device /dev/video0 \
>   -e DISPLAY=$DISPLAY \
>   -v /tmp/.X11-unix:/tmp/.X11-unix \
>   --runtime nvidia \
>   v4l2-viewer
> ```

## 4. Save / Load the Image (optional)

To transfer the built image to another Orin Nano without rebuilding:

```bash
# Save to a tar file
sudo docker save v4l2-viewer > v4l2-viewer.tar

# On the other machine, load it
sudo docker load < v4l2-viewer.tar
```

## 5. Stop the Container

```bash
# If using docker compose
sudo docker compose down

# If using docker run, press Ctrl+C or from another terminal:
sudo docker ps          # find the container ID
sudo docker stop <id>
```
