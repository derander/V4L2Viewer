// camera-channel.js — QWebChannel wrapper (promise-based)
// Provides a global CameraChannel object that wraps the CameraBridge QObject

window.CameraChannel = {
    bridge: null,
    ready: false,
    _readyCallbacks: [],

    init() {
        return new Promise((resolve, reject) => {
            if (typeof QWebChannel === 'undefined') {
                reject(new Error('QWebChannel not available'));
                return;
            }

            new QWebChannel(qt.webChannelTransport, (channel) => {
                this.bridge = channel.objects.bridge;
                this.ready = true;

                // Notify waiting callbacks
                this._readyCallbacks.forEach(cb => cb());
                this._readyCallbacks = [];

                resolve(this.bridge);
            });
        });
    },

    onReady(callback) {
        if (this.ready) {
            callback();
        } else {
            this._readyCallbacks.push(callback);
        }
    },

    // Promise wrappers for all bridge methods
    getCameraList() {
        return this._call('getCameraList');
    },

    openCamera(index) {
        return this._call('openCamera', index);
    },

    closeCamera() {
        return this._call('closeCamera');
    },

    getDeviceInfo() {
        return this._call('getDeviceInfo');
    },

    startStreaming() {
        return this._call('startStreaming');
    },

    stopStreaming() {
        return this._call('stopStreaming');
    },

    getExposure() {
        return this._call('getExposure');
    },

    setExposure(value) {
        return this._call('setExposure', value);
    },

    setAutoExposure(enabled) {
        return this._call('setAutoExposure', enabled);
    },

    getGain() {
        return this._call('getGain');
    },

    setGain(value) {
        return this._call('setGain', value);
    },

    setAutoGain(enabled) {
        return this._call('setAutoGain', enabled);
    },

    getGamma() {
        return this._call('getGamma');
    },

    setGamma(value) {
        return this._call('setGamma', value);
    },

    getBrightness() {
        return this._call('getBrightness');
    },

    setBrightness(value) {
        return this._call('setBrightness', value);
    },

    getWhiteBalance() {
        return this._call('getWhiteBalance');
    },

    setAutoWhiteBalance(enabled) {
        return this._call('setAutoWhiteBalance', enabled);
    },

    getFrameRate() {
        return this._call('getFrameRate');
    },

    setFrameRate(hz) {
        return this._call('setFrameRate', hz);
    },

    setFrameRateAuto(enabled) {
        return this._call('setFrameRateAuto', enabled);
    },

    getCrop() {
        return this._call('getCrop');
    },

    setCrop(x, y, w, h) {
        return this._call('setCrop', x, y, w, h);
    },

    setFlipX(enabled) {
        return this._call('setFlipX', enabled);
    },

    setFlipY(enabled) {
        return this._call('setFlipY', enabled);
    },

    getPixelFormats() {
        return this._call('getPixelFormats');
    },

    setPixelFormat(fmt) {
        return this._call('setPixelFormat', fmt);
    },

    getFrameSizes(fmt) {
        return this._call('getFrameSizes', fmt);
    },

    setFrameSize(w, h) {
        return this._call('setFrameSize', w, h);
    },

    setFrameSizeByIndex(index) {
        return this._call('setFrameSizeByIndex', index);
    },

    enumerateControls() {
        return this._call('enumerateControls');
    },

    setControlInt(id, val) {
        return this._call('setControlInt', id, val);
    },

    setControlInt64(id, val) {
        return this._call('setControlInt64', id, val);
    },

    setControlBool(id, val) {
        return this._call('setControlBool', id, val);
    },

    setControlButton(id) {
        return this._call('setControlButton', id);
    },

    setControlList(id, str) {
        return this._call('setControlList', id, str);
    },

    setControlIntList(id, val) {
        return this._call('setControlIntList', id, val);
    },

    setControlString(id, str) {
        return this._call('setControlString', id, str);
    },

    startRecording(path, format, maxBytes) {
        return this._call('startRecording', path, format, maxBytes);
    },

    stopRecording() {
        return this._call('stopRecording');
    },

    getRecordingState() {
        return this._call('getRecordingState');
    },

    recordDialog(format, maxBytes) {
        return this._call('recordDialog', format, maxBytes);
    },

    saveImage(path, format) {
        return this._call('saveImage', path, format);
    },

    saveImageDialog() {
        return this._call('saveImageDialog');
    },

    getStats() {
        return this._call('getStats');
    },

    // Internal: call a bridge method and return a promise
    _call(method, ...args) {
        return new Promise((resolve, reject) => {
            if (!this.bridge) {
                reject(new Error('Bridge not initialized'));
                return;
            }
            if (typeof this.bridge[method] !== 'function') {
                reject(new Error(`Unknown method: ${method}`));
                return;
            }
            this.bridge[method](...args, (result) => {
                if (result && result.ok === false) {
                    reject(new Error(result.error || 'Unknown error'));
                } else {
                    resolve(result);
                }
            });
        });
    }
};
