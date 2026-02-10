// frame-renderer.js — WebSocket receiver + canvas renderer

window.FrameRenderer = {
    ws: null,
    canvas: null,
    ctx: null,
    connected: false,
    frameCount: 0,
    lastFrameId: 0,
    width: 0,
    height: 0,
    _rendering: false,
    // Software crop region (frame pixels); null = full frame
    cropRegion: null,
    // Callback invoked after each frame render with (canvasWidth, canvasHeight)
    onCanvasResize: null,

    connect(port, canvas) {
        console.log('[FrameRenderer] Connecting to ws://127.0.0.1:' + port, 'canvas:', canvas);
        if (!canvas) {
            console.error('[FrameRenderer] Canvas element is null!');
            return;
        }

        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.frameCount = 0;
        this._rendering = false;

        if (this.ws) {
            this.ws.close();
        }

        const url = 'ws://127.0.0.1:' + port;
        this.ws = new WebSocket(url);
        this.ws.binaryType = 'arraybuffer';

        this.ws.onopen = () => {
            console.log('[FrameRenderer] WebSocket connected');
            this.connected = true;
            // Signal server we're ready for the first frame
            this.ws.send('ack');
        };

        this.ws.onclose = (e) => {
            console.log('[FrameRenderer] WebSocket closed, code:', e.code, 'reason:', e.reason);
            this.connected = false;
        };

        this.ws.onerror = (e) => {
            console.error('[FrameRenderer] WebSocket error:', e);
            this.connected = false;
        };

        this.ws.onmessage = (event) => {
            this._handleFrame(event.data);
        };
    },

    disconnect() {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        this.connected = false;
    },

    _handleFrame(data) {
        if (data.byteLength < 16) return;

        // Drop frames while previous decode is still in flight
        if (this._rendering) return;
        this._rendering = true;

        const view = new DataView(data);
        const width = view.getUint32(0, true);   // LE
        const height = view.getUint32(4, true);   // LE
        const frameIdLo = view.getUint32(8, true);
        const frameIdHi = view.getUint32(12, true);
        const frameId = frameIdLo + frameIdHi * 0x100000000;

        this.lastFrameId = frameId;
        this.width = width;
        this.height = height;

        if (this.frameCount === 0) {
            console.log('[FrameRenderer] First frame received:', width, 'x', height, 'jpeg size:', data.byteLength - 16);
        }

        // Extract JPEG data
        const jpegData = new Uint8Array(data, 16);
        const blob = new Blob([jpegData], { type: 'image/jpeg' });

        // Async decode to keep UI responsive
        createImageBitmap(blob).then((bitmap) => {
            if (!this.canvas) {
                bitmap.close();
                this._rendering = false;
                return;
            }

            const cr = this.cropRegion;
            let dw, dh;

            if (cr) {
                // Software crop: draw only the selected region
                dw = cr.w;
                dh = cr.h;
                if (this.canvas.width !== dw || this.canvas.height !== dh) {
                    this.canvas.width = dw;
                    this.canvas.height = dh;
                    if (this.onCanvasResize) this.onCanvasResize(dw, dh);
                }
                this.ctx.drawImage(bitmap, cr.x, cr.y, cr.w, cr.h, 0, 0, dw, dh);
            } else {
                // Full frame
                dw = width;
                dh = height;
                if (this.canvas.width !== dw || this.canvas.height !== dh) {
                    console.log('[FrameRenderer] Resizing canvas to', dw, 'x', dh);
                    this.canvas.width = dw;
                    this.canvas.height = dh;
                    if (this.onCanvasResize) this.onCanvasResize(dw, dh);
                }
                this.ctx.drawImage(bitmap, 0, 0);
            }

            bitmap.close();
            this.frameCount++;
            this._rendering = false;
            // Tell server we're ready for the next frame
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                this.ws.send('ack');
            }
        }).catch((err) => {
            console.error('[FrameRenderer] Decode error:', err);
            this._rendering = false;
        });
    }
};
