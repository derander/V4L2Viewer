// app.js — Main Vue 3 application + components (Material Design 3 theme)
const { createApp, ref, reactive, computed, watch, onMounted, onBeforeUnmount, nextTick, defineComponent } = Vue;

// --- ControlSlider component ---
const ControlSlider = defineComponent({
    name: 'ControlSlider',
    props: {
        label: String,
        value: Number,
        min: { type: Number, default: 0 },
        max: { type: Number, default: 100 },
        step: { type: Number, default: 1 },
        unit: { type: String, default: '' },
        disabled: { type: Boolean, default: false },
        logarithmic: { type: Boolean, default: false },
        autoSupported: { type: Boolean, default: false },
        autoEnabled: { type: Boolean, default: false },
    },
    emits: ['update', 'auto-toggle'],
    setup(props, { emit }) {
        const displayValue = computed(() => {
            if (props.value == null) return '—';
            return Math.round(props.value);
        });

        const sliderValue = computed(() => {
            if (!props.logarithmic || props.min <= 0 || props.max <= 0) return props.value;
            const logMin = Math.log(props.min);
            const logMax = Math.log(props.max);
            const scale = (logMax - logMin) / 1000;
            return Math.round((Math.log(Math.max(props.value, props.min)) - logMin) / scale);
        });

        const sliderMin = computed(() => props.logarithmic ? 0 : props.min);
        const sliderMax = computed(() => props.logarithmic ? 1000 : props.max);
        const sliderStep = computed(() => props.logarithmic ? 1 : props.step);

        function onSliderInput(e) {
            const sv = Number(e.target.value);
            let realValue;
            if (props.logarithmic && props.min > 0 && props.max > 0) {
                const logMin = Math.log(props.min);
                const logMax = Math.log(props.max);
                const scale = (logMax - logMin) / 1000;
                realValue = Math.round(Math.exp(logMin + scale * sv));
            } else {
                realValue = sv;
            }
            emit('update', realValue);
        }

        function onInputChange(e) {
            const v = Number(e.target.value);
            if (!isNaN(v)) {
                emit('update', Math.max(props.min, Math.min(props.max, v)));
            }
        }

        function onAutoToggle() {
            emit('auto-toggle', !props.autoEnabled);
        }

        return { displayValue, sliderValue, sliderMin, sliderMax, sliderStep, onSliderInput, onInputChange, onAutoToggle };
    },
    template: `
        <div class="control-slider" :class="{ disabled: disabled }">
            <div class="control-label">
                <span>{{ label }}</span>
                <span>
                    <button v-if="autoSupported" class="auto-badge" :class="{ active: autoEnabled }" @click="onAutoToggle">AUTO</button>
                    <span class="value" style="margin-left:8px">{{ displayValue }}{{ unit ? ' ' + unit : '' }}</span>
                </span>
            </div>
            <div class="control-body">
                <input type="range"
                    :min="sliderMin" :max="sliderMax" :step="sliderStep"
                    :value="sliderValue"
                    @input="onSliderInput"
                    :disabled="disabled || autoEnabled"
                    class="slider">
                <input type="number"
                    :value="displayValue"
                    @change="onInputChange"
                    :disabled="disabled || autoEnabled"
                    class="value-input">
                <span class="unit" v-if="unit">{{ unit }}</span>
            </div>
        </div>
    `
});

// --- DynamicControl component ---
const DynamicControl = defineComponent({
    name: 'DynamicControl',
    props: { control: Object },
    emits: ['set-int', 'set-int64', 'set-bool', 'set-button', 'set-list', 'set-int-list', 'set-string'],
    setup(props, { emit }) {
        function onIntChange(val) { emit('set-int', props.control.id, val); }
        function onInt64Change(val) { emit('set-int64', props.control.id, val); }
        function onBoolToggle() { emit('set-bool', props.control.id, !props.control.value); }
        function onButtonClick() { emit('set-button', props.control.id); }
        function onListChange(e) { emit('set-list', props.control.id, e.target.value); }
        function onListIntChange(e) { emit('set-int-list', props.control.id, Number(e.target.value)); }
        function onStringChange(e) { emit('set-string', props.control.id, e.target.value); }

        return { onIntChange, onInt64Change, onBoolToggle, onButtonClick, onListChange, onListIntChange, onStringChange };
    },
    template: `
        <div class="dynamic-control">
            <template v-if="control.type === 'int'">
                <control-slider
                    :label="control.name"
                    :value="control.value"
                    :min="control.min"
                    :max="control.max"
                    :unit="control.unit"
                    :disabled="control.readOnly"
                    @update="onIntChange"
                />
            </template>
            <template v-else-if="control.type === 'int64'">
                <control-slider
                    :label="control.name"
                    :value="control.value"
                    :min="control.min"
                    :max="control.max"
                    :unit="control.unit"
                    :disabled="control.readOnly"
                    @update="onInt64Change"
                />
            </template>
            <template v-else-if="control.type === 'bool'">
                <div class="toggle-switch">
                    <div class="switch" :class="{ on: control.value }" @click="onBoolToggle">
                        <div class="knob"></div>
                    </div>
                    <span class="switch-label">{{ control.name }}</span>
                </div>
            </template>
            <template v-else-if="control.type === 'button'">
                <div class="control-row horizontal">
                    <label style="font-size:12px;color:#aaa">{{ control.name }}</label>
                    <button @click="onButtonClick" :disabled="control.readOnly" class="btn btn-sm">Execute</button>
                </div>
            </template>
            <template v-else-if="control.type === 'list'">
                <div class="control-row">
                    <div class="control-label"><span>{{ control.name }}</span></div>
                    <select @change="onListChange" :disabled="control.readOnly" class="modern-select">
                        <option v-for="(item, idx) in control.items" :key="idx" :value="item" :selected="idx === control.value">
                            {{ item }}
                        </option>
                    </select>
                </div>
            </template>
            <template v-else-if="control.type === 'listInt'">
                <div class="control-row">
                    <div class="control-label"><span>{{ control.name }}</span></div>
                    <select @change="onListIntChange" :disabled="control.readOnly" class="modern-select">
                        <option v-for="(item, idx) in control.items" :key="idx" :value="item" :selected="idx === control.value">
                            {{ item }}
                        </option>
                    </select>
                </div>
            </template>
            <template v-else-if="control.type === 'string'">
                <div class="control-row">
                    <div class="control-label"><span>{{ control.name }}</span></div>
                    <input type="text" :value="control.value" @change="onStringChange" :disabled="control.readOnly" class="text-input">
                </div>
            </template>
        </div>
    `
});

// --- TitleBar component ---
const TitleBar = defineComponent({
    name: 'TitleBar',
    props: {
        isStreaming: Boolean,
    },
    template: `
        <header class="titlebar">
            <div class="titlebar-left">
                <div class="app-logo">
                    <span class="icon" v-html="Icons.videocam"></span>
                </div>
                <span class="app-title">V4L2 Viewer</span>
            </div>
            <div class="titlebar-right">
                <div class="status-chip" :class="isStreaming ? 'streaming' : 'idle'">
                    <span class="status-dot"></span>
                    {{ isStreaming ? 'Streaming' : 'Idle' }}
                </div>
            </div>
        </header>
    `
});

// --- Sidebar component ---
const Sidebar = defineComponent({
    name: 'Sidebar',
    props: {
        cameras: Array,
        selectedCamera: Number,
        isOpen: Boolean,
    },
    emits: ['select-camera', 'toggle-open'],
    setup(props) {
        const searchQuery = ref('');

        const filteredCameras = computed(() => {
            if (!searchQuery.value) return props.cameras;
            const q = searchQuery.value.toLowerCase();
            return props.cameras.filter(c => c.label.toLowerCase().includes(q));
        });

        return { searchQuery, filteredCameras };
    },
    template: `
        <div class="sidebar">
            <div class="sidebar-header">
                <h3>Devices</h3>
                <div class="search-box">
                    <span class="icon" v-html="Icons.search"></span>
                    <input type="text" placeholder="Search cameras..." v-model="searchQuery">
                </div>
            </div>
            <div class="camera-list">
                <div v-for="cam in filteredCameras" :key="cam.index"
                     class="camera-item" :class="{ active: cam.index === selectedCamera }"
                     @click="$emit('select-camera', cam.index)">
                    <div class="camera-icon">
                        <span class="icon" v-html="Icons.videocam"></span>
                    </div>
                    <div class="camera-info">
                        <h4>{{ cam.label }}</h4>
                        <p>/dev/video{{ cam.index }}</p>
                    </div>
                </div>
                <div v-if="filteredCameras.length === 0" style="padding:16px;text-align:center;color:#555;font-size:12px">
                    No cameras found
                </div>
            </div>
            <div class="sidebar-footer">
                <button class="open-btn" :class="{ 'close-btn': isOpen }"
                        @click="$emit('toggle-open')"
                        :disabled="cameras.length === 0 && !isOpen">
                    {{ isOpen ? 'Close Camera' : 'Open Camera' }}
                </button>
            </div>
        </div>
    `
});

// --- Toolbar component ---
const Toolbar = defineComponent({
    name: 'Toolbar',
    props: {
        isOpen: Boolean,
        isStreaming: Boolean,
        zoom: Number,
    },
    emits: ['start-stream', 'stop-stream', 'zoom-in', 'zoom-out', 'zoom-fit', 'save-image', 'flip-x', 'flip-y', 'snapshot'],
    template: `
        <div class="toolbar">
            <div class="toolbar-group">
                <button class="tool-btn primary" @click="$emit('start-stream')" :disabled="!isOpen || isStreaming">
                    <span class="icon" v-html="Icons.play_arrow"></span> Start
                </button>
                <button class="tool-btn danger" @click="$emit('stop-stream')" :disabled="!isStreaming">
                    <span class="icon" v-html="Icons.stop"></span> Stop
                </button>
                <div class="toolbar-divider"></div>
                <button class="tool-btn" @click="$emit('snapshot')" :disabled="!isStreaming" title="Save Snapshot">
                    <span class="icon" v-html="Icons.photo_camera"></span> Snapshot
                </button>
            </div>
            <div class="toolbar-group">
                <button class="tool-btn" @click="$emit('flip-x')" :disabled="!isOpen" title="Flip Horizontal">
                    <span class="icon" v-html="Icons.flip"></span>
                </button>
                <button class="tool-btn" @click="$emit('flip-y')" :disabled="!isOpen" title="Flip Vertical">
                    <span class="icon" style="transform:rotate(90deg)" v-html="Icons.flip"></span>
                </button>
                <div class="toolbar-divider"></div>
                <div class="zoom-control">
                    <button @click="$emit('zoom-out')" title="Zoom Out">
                        <span class="icon" v-html="Icons.remove"></span>
                    </button>
                    <span class="zoom-label">{{ Math.round(zoom * 100) }}%</span>
                    <button @click="$emit('zoom-in')" title="Zoom In">
                        <span class="icon" v-html="Icons.add"></span>
                    </button>
                    <button @click="$emit('zoom-fit')" title="Fit to Window">
                        <span class="icon" v-html="Icons.fit_screen"></span>
                    </button>
                </div>
            </div>
        </div>
    `
});

// --- ControlPanel component (right panel) ---
const ControlPanel = defineComponent({
    name: 'ControlPanel',
    components: { ControlSlider, DynamicControl },
    props: {
        controls: Array,
        exposure: Object,
        gain: Object,
        gamma: Object,
        brightness: Object,
        whiteBalance: Object,
        frameRate: Object,
        pixelFormats: Object,
        frameSizes: Object,
        crop: Object,
        isStreaming: { type: Boolean, default: false },
    },
    emits: [
        'set-exposure', 'set-auto-exposure',
        'set-gain', 'set-auto-gain',
        'set-gamma', 'set-brightness',
        'set-auto-white-balance',
        'set-frame-rate', 'set-frame-rate-auto',
        'set-pixel-format', 'set-frame-size',
        'set-crop',
        'set-control-int', 'set-control-int64',
        'set-control-bool', 'set-control-button',
        'set-control-list', 'set-control-int-list', 'set-control-string',
    ],
    setup() {
        const sections = reactive({
            image: true,
            format: true,
            controls: true,
            advanced: false,
        });

        function toggleSection(name) {
            sections[name] = !sections[name];
        }

        return { sections, toggleSection };
    },
    template: `
        <aside class="right-panel">
            <!-- Image Controls -->
            <div class="panel-section">
                <div class="panel-header" @click="toggleSection('image')">
                    <h3><span class="icon" v-html="Icons.exposure"></span> Exposure &amp; Image</h3>
                    <span class="toggle-icon" :class="{ open: sections.image }" v-html="Icons.expand_more"></span>
                </div>
                <div class="panel-body" v-show="sections.image">
                    <control-slider v-if="exposure && exposure.supported"
                        label="Exposure Time"
                        :value="exposure.value"
                        :min="exposure.min"
                        :max="exposure.max"
                        :logarithmic="true"
                        :auto-supported="exposure.autoSupported"
                        :auto-enabled="exposure.autoEnabled"
                        unit="us"
                        @update="$emit('set-exposure', $event)"
                        @auto-toggle="$emit('set-auto-exposure', $event)"
                    />
                    <control-slider v-if="gain && gain.supported"
                        label="Gain"
                        :value="gain.value"
                        :min="gain.min"
                        :max="gain.max"
                        :auto-supported="gain.autoSupported"
                        :auto-enabled="gain.autoEnabled"
                        @update="$emit('set-gain', $event)"
                        @auto-toggle="$emit('set-auto-gain', $event)"
                    />
                    <control-slider v-if="gamma && gamma.supported"
                        label="Gamma"
                        :value="gamma.value"
                        :min="gamma.min"
                        :max="gamma.max"
                        @update="$emit('set-gamma', $event)"
                    />
                    <control-slider v-if="brightness && brightness.supported"
                        label="Brightness"
                        :value="brightness.value"
                        :min="brightness.min"
                        :max="brightness.max"
                        @update="$emit('set-brightness', $event)"
                    />
                    <div class="toggle-switch" v-if="whiteBalance && whiteBalance.supported">
                        <div class="switch" :class="{ on: whiteBalance.autoEnabled }" @click="$emit('set-auto-white-balance', !whiteBalance.autoEnabled)">
                            <div class="knob"></div>
                        </div>
                        <span class="switch-label">Auto White Balance</span>
                    </div>
                </div>
            </div>

            <!-- Format -->
            <div class="panel-section">
                <div class="panel-header" @click="toggleSection('format')">
                    <h3><span class="icon" v-html="Icons.aspect_ratio"></span> Format</h3>
                    <span class="toggle-icon" :class="{ open: sections.format }" v-html="Icons.expand_more"></span>
                </div>
                <div class="panel-body" v-show="sections.format">
                    <div class="control-row" v-if="pixelFormats">
                        <div class="control-label"><span>Pixel Format</span></div>
                        <select class="modern-select" :disabled="isStreaming" @change="$emit('set-pixel-format', $event.target.value)">
                            <option v-for="fmt in pixelFormats.formats" :key="fmt.name"
                                    :value="fmt.name" :disabled="!fmt.supported"
                                    :selected="fmt.name === pixelFormats.current">
                                {{ fmt.name }}{{ !fmt.supported ? ' (unsupported)' : '' }}
                            </option>
                        </select>
                    </div>
                    <div class="control-row" v-if="frameSizes && frameSizes.sizes && frameSizes.sizes.length > 0">
                        <div class="control-label"><span>Frame Size</span></div>
                        <select class="modern-select" :disabled="isStreaming" @change="$emit('set-frame-size', Number($event.target.value))">
                            <option v-for="(size, idx) in frameSizes.sizes" :key="idx"
                                    :value="idx" :selected="idx === frameSizes.currentIndex">
                                {{ size }}
                            </option>
                        </select>
                    </div>
                    <p class="hint-text" v-if="isStreaming">Stop streaming to change format</p>
                    <div class="control-row" v-if="frameRate && frameRate.supported">
                        <div class="control-label"><span>Frame Rate</span></div>
                        <div class="inline-group">
                            <input type="number" :value="Math.round(frameRate.fps)" class="value-input"
                                @change="$emit('set-frame-rate', Number($event.target.value))"
                                :disabled="frameRate.auto" step="1" min="1">
                            <span>fps</span>
                            <div class="toggle-switch" style="margin-bottom:0">
                                <div class="switch" :class="{ on: frameRate.auto }" @click="$emit('set-frame-rate-auto', !frameRate.auto)">
                                    <div class="knob"></div>
                                </div>
                                <span class="switch-label">Auto</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Enumerated Controls -->
            <div class="panel-section" v-if="controls && controls.length > 0">
                <div class="panel-header" @click="toggleSection('controls')">
                    <h3><span class="icon" v-html="Icons.tune"></span> Device Controls</h3>
                    <span class="toggle-icon" :class="{ open: sections.controls }" v-html="Icons.expand_more"></span>
                </div>
                <div class="panel-body" v-show="sections.controls">
                    <dynamic-control
                        v-for="ctrl in controls"
                        :key="ctrl.id"
                        :control="ctrl"
                        @set-int="(id, val) => $emit('set-control-int', id, val)"
                        @set-int64="(id, val) => $emit('set-control-int64', id, val)"
                        @set-bool="(id, val) => $emit('set-control-bool', id, val)"
                        @set-button="(id) => $emit('set-control-button', id)"
                        @set-list="(id, val) => $emit('set-control-list', id, val)"
                        @set-int-list="(id, val) => $emit('set-control-int-list', id, val)"
                        @set-string="(id, val) => $emit('set-control-string', id, val)"
                    />
                </div>
            </div>

            <!-- Advanced -->
            <div class="panel-section">
                <div class="panel-header" @click="toggleSection('advanced')">
                    <h3><span class="icon" v-html="Icons.crop"></span> Advanced</h3>
                    <span class="toggle-icon" :class="{ open: sections.advanced }" v-html="Icons.expand_more"></span>
                </div>
                <div class="panel-body" v-show="sections.advanced">
                    <div class="control-row" v-if="crop && crop.supported">
                        <div class="control-label"><span>Crop Region</span></div>
                        <div class="crop-inputs">
                            <input type="number" :value="crop.x" placeholder="X" class="crop-input"
                                @change="$emit('set-crop', Number($event.target.value), crop.y, crop.width, crop.height)">
                            <input type="number" :value="crop.y" placeholder="Y" class="crop-input"
                                @change="$emit('set-crop', crop.x, Number($event.target.value), crop.width, crop.height)">
                            <input type="number" :value="crop.width" placeholder="W" class="crop-input"
                                @change="$emit('set-crop', crop.x, crop.y, Number($event.target.value), crop.height)">
                            <input type="number" :value="crop.height" placeholder="H" class="crop-input"
                                @change="$emit('set-crop', crop.x, crop.y, crop.width, Number($event.target.value))">
                        </div>
                    </div>
                </div>
            </div>
        </aside>
    `
});

// --- FrameViewer component ---
const FrameViewer = defineComponent({
    name: 'FrameViewer',
    props: {
        isStreaming: Boolean,
        frameStreamPort: Number,
        zoom: Number,
        fps: Object,
        frameInfo: Object,
        pixelFormats: Object,
    },
    setup(props) {
        const canvasRef = ref(null);

        watch(() => props.isStreaming, (streaming) => {
            if (streaming && props.frameStreamPort > 0) {
                nextTick(() => {
                    FrameRenderer.connect(props.frameStreamPort, canvasRef.value);
                });
            } else {
                FrameRenderer.disconnect();
            }
        });

        onBeforeUnmount(() => {
            FrameRenderer.disconnect();
        });

        const canvasStyle = computed(() => ({
            transform: `scale(${props.zoom})`,
            transformOrigin: 'top left',
        }));

        const fpsText = computed(() => {
            if (!props.fps) return null;
            return props.fps.received.toFixed(1) + ' FPS';
        });

        const resText = computed(() => {
            if (!props.frameInfo) return null;
            return props.frameInfo.width + ' x ' + props.frameInfo.height;
        });

        const fmtText = computed(() => {
            if (!props.pixelFormats || !props.pixelFormats.current) return null;
            return props.pixelFormats.current;
        });

        return { canvasRef, canvasStyle, fpsText, resText, fmtText };
    },
    template: `
        <div class="frame-viewer">
            <div class="viewport-overlay" v-if="isStreaming">
                <div class="overlay-badge fps" v-if="fpsText">{{ fpsText }}</div>
                <div class="overlay-badge res" v-if="resText">{{ resText }}</div>
                <div class="overlay-badge fmt" v-if="fmtText">{{ fmtText }}</div>
            </div>
            <div class="canvas-container">
                <canvas ref="canvasRef" :style="canvasStyle" width="640" height="480"></canvas>
                <div class="no-stream-overlay" v-if="!isStreaming">
                    <span class="placeholder-icon" v-html="Icons.camera_alt"></span>
                    <p>No stream active</p>
                    <p class="hint">Open a camera and click Start to begin streaming</p>
                </div>
            </div>
        </div>
    `
});

// --- StatusBar component ---
const StatusBar = defineComponent({
    name: 'StatusBar',
    props: {
        fps: Object,
        frameInfo: Object,
        status: String,
    },
    template: `
        <footer class="status-bar">
            <div class="statusbar-left">
                <span class="status-text">{{ status }}</span>
            </div>
            <div class="statusbar-right">
                <span class="status-item" v-if="frameInfo">
                    {{ frameInfo.width }}x{{ frameInfo.height }}
                </span>
                <span class="status-item" v-if="fps">
                    {{ fps.received.toFixed(1) }} fps
                </span>
                <span class="status-item" v-if="frameInfo">
                    Frame #{{ frameInfo.frameId }}
                </span>
            </div>
        </footer>
    `
});

// --- Main App ---
const app = createApp({
    components: { TitleBar, Sidebar, Toolbar, ControlPanel, FrameViewer, StatusBar },
    setup() {
        const cameras = ref([]);
        const selectedCamera = ref(-1);
        const isOpen = ref(false);
        const isStreaming = ref(false);
        const frameStreamPort = ref(0);
        const zoom = ref(1.0);
        const statusText = ref('Initializing...');

        const exposure = ref(null);
        const gain = ref(null);
        const gammaCtrl = ref(null);
        const brightness = ref(null);
        const whiteBalance = ref(null);
        const frameRate = ref(null);
        const pixelFormats = ref(null);
        const frameSizes = ref(null);
        const crop = ref(null);
        const controls = ref([]);

        const fps = ref(null);
        const frameInfo = ref(null);

        // Flip state tracking
        const flipX = ref(false);
        const flipY = ref(false);

        // Initialize QWebChannel
        onMounted(async () => {
            try {
                const bridge = await CameraChannel.init();
                frameStreamPort.value = bridge.frameStreamPort;

                // Wire up signals
                bridge.cameraListChanged.connect((data) => {
                    cameras.value = data.cameras || [];
                    if (selectedCamera.value < 0 && cameras.value.length > 0) {
                        selectedCamera.value = 0;
                    }
                });

                bridge.openStateChanged.connect((open) => {
                    isOpen.value = open;
                    if (open) {
                        refreshControls();
                    } else {
                        resetControls();
                    }
                });

                bridge.streamingStateChanged.connect((streaming) => {
                    isStreaming.value = streaming;
                    if (!streaming) {
                        fps.value = null;
                    }
                });

                bridge.statsUpdated.connect((data) => {
                    fps.value = { received: data.receivedFps || 0 };
                });

                bridge.frameInfoUpdated.connect((data) => {
                    frameInfo.value = data;
                });

                bridge.autoExposureValueChanged.connect((val) => {
                    if (exposure.value) {
                        exposure.value = { ...exposure.value, value: val };
                    }
                });

                bridge.autoGainValueChanged.connect((val) => {
                    if (gain.value) {
                        gain.value = { ...gain.value, value: val };
                    }
                });

                bridge.controlIntDiscovered.connect((data) => {
                    addOrUpdateControl(data);
                });

                bridge.controlInt64Discovered.connect((data) => {
                    addOrUpdateControl(data);
                });

                bridge.controlBoolDiscovered.connect((data) => {
                    addOrUpdateControl(data);
                });

                bridge.controlButtonDiscovered.connect((data) => {
                    addOrUpdateControl(data);
                });

                bridge.controlListDiscovered.connect((data) => {
                    addOrUpdateControl(data);
                });

                bridge.controlStringDiscovered.connect((data) => {
                    addOrUpdateControl(data);
                });

                bridge.controlValueChanged.connect((data) => {
                    const idx = controls.value.findIndex(c => c.id === data.id);
                    if (idx >= 0) {
                        controls.value[idx] = { ...controls.value[idx], value: data.value };
                    }
                });

                bridge.controlStateChanged.connect((id, enabled) => {
                    const idx = controls.value.findIndex(c => c.id === id);
                    if (idx >= 0) {
                        controls.value[idx] = { ...controls.value[idx], readOnly: !enabled };
                    }
                });

                bridge.statusMessage.connect((msg) => {
                    statusText.value = msg;
                });

                bridge.errorOccurred.connect((msg) => {
                    statusText.value = 'Error: ' + msg;
                });

                // Initial camera list
                const list = await CameraChannel.getCameraList();
                cameras.value = list.cameras || [];
                if (cameras.value.length > 0) {
                    selectedCamera.value = 0;
                }

                statusText.value = 'Ready';
            } catch (err) {
                statusText.value = 'Failed to initialize: ' + err.message;
            }
        });

        function addOrUpdateControl(data) {
            const idx = controls.value.findIndex(c => c.id === data.id);
            if (idx >= 0) {
                controls.value[idx] = data;
            } else {
                controls.value.push(data);
            }
        }

        async function refreshControls() {
            try {
                controls.value = [];
                await CameraChannel.enumerateControls();

                const [expData, gainData, gammaData, brightData, wbData, frData, pfData, cropData] =
                    await Promise.all([
                        CameraChannel.getExposure(),
                        CameraChannel.getGain(),
                        CameraChannel.getGamma(),
                        CameraChannel.getBrightness(),
                        CameraChannel.getWhiteBalance(),
                        CameraChannel.getFrameRate(),
                        CameraChannel.getPixelFormats(),
                        CameraChannel.getCrop(),
                    ]);

                exposure.value = expData;
                gain.value = gainData;
                gammaCtrl.value = gammaData;
                brightness.value = brightData;
                whiteBalance.value = wbData;
                frameRate.value = frData;
                pixelFormats.value = pfData;
                crop.value = cropData;

                if (pfData.current) {
                    const fsData = await CameraChannel.getFrameSizes(pfData.current);
                    frameSizes.value = fsData;
                }
            } catch (err) {
                statusText.value = 'Error reading controls: ' + err.message;
            }
        }

        function resetControls() {
            exposure.value = null;
            gain.value = null;
            gammaCtrl.value = null;
            brightness.value = null;
            whiteBalance.value = null;
            frameRate.value = null;
            pixelFormats.value = null;
            frameSizes.value = null;
            crop.value = null;
            controls.value = [];
            fps.value = null;
            frameInfo.value = null;
            flipX.value = false;
            flipY.value = false;
        }

        async function toggleOpen() {
            try {
                if (isOpen.value) {
                    await CameraChannel.closeCamera();
                } else {
                    if (selectedCamera.value >= 0) {
                        await CameraChannel.openCamera(selectedCamera.value);
                    }
                }
            } catch (err) {
                statusText.value = 'Error: ' + err.message;
            }
        }

        async function startStream() {
            try {
                await CameraChannel.startStreaming();
            } catch (err) {
                statusText.value = 'Error: ' + err.message;
            }
        }

        async function stopStream() {
            try {
                await CameraChannel.stopStreaming();
            } catch (err) {
                statusText.value = 'Error: ' + err.message;
            }
        }

        // Control setters
        async function setExposure(val) {
            try { await CameraChannel.setExposure(val); exposure.value = { ...exposure.value, value: val }; } catch(e) { statusText.value = e.message; }
        }
        async function setAutoExposure(enabled) {
            try { await CameraChannel.setAutoExposure(enabled); exposure.value = { ...exposure.value, autoEnabled: enabled }; } catch(e) { statusText.value = e.message; }
        }
        async function setGain(val) {
            try { await CameraChannel.setGain(val); gain.value = { ...gain.value, value: val }; } catch(e) { statusText.value = e.message; }
        }
        async function setAutoGain(enabled) {
            try { await CameraChannel.setAutoGain(enabled); gain.value = { ...gain.value, autoEnabled: enabled }; } catch(e) { statusText.value = e.message; }
        }
        async function setGamma(val) {
            try { await CameraChannel.setGamma(val); gammaCtrl.value = { ...gammaCtrl.value, value: val }; } catch(e) { statusText.value = e.message; }
        }
        async function setBrightness(val) {
            try { await CameraChannel.setBrightness(val); brightness.value = { ...brightness.value, value: val }; } catch(e) { statusText.value = e.message; }
        }
        async function setAutoWhiteBalance(enabled) {
            try { await CameraChannel.setAutoWhiteBalance(enabled); whiteBalance.value = { ...whiteBalance.value, autoEnabled: enabled }; } catch(e) { statusText.value = e.message; }
        }
        async function setFrameRate(hz) {
            try { await CameraChannel.setFrameRate(hz); frameRate.value = { ...frameRate.value, fps: hz, auto: false }; } catch(e) { statusText.value = e.message; }
        }
        async function setFrameRateAuto(enabled) {
            try { await CameraChannel.setFrameRateAuto(enabled); frameRate.value = { ...frameRate.value, auto: enabled }; } catch(e) { statusText.value = e.message; }
        }
        async function setPixelFormat(fmt) {
            try {
                await CameraChannel.setPixelFormat(fmt);
                const pfData = await CameraChannel.getPixelFormats();
                pixelFormats.value = pfData;
                if (pfData.current) {
                    const fsData = await CameraChannel.getFrameSizes(pfData.current);
                    frameSizes.value = fsData;
                }
                await refreshControls();
            } catch(e) { statusText.value = e.message; }
        }
        async function setFrameSizeByIndex(index) {
            try {
                await CameraChannel.setFrameSizeByIndex(index);
                await refreshControls();
            } catch(e) { statusText.value = e.message; }
        }
        async function setCrop(x, y, w, h) {
            try { await CameraChannel.setCrop(x, y, w, h); } catch(e) { statusText.value = e.message; }
        }
        async function toggleFlipX() {
            flipX.value = !flipX.value;
            try { await CameraChannel.setFlipX(flipX.value); } catch(e) { statusText.value = e.message; }
        }
        async function toggleFlipY() {
            flipY.value = !flipY.value;
            try { await CameraChannel.setFlipY(flipY.value); } catch(e) { statusText.value = e.message; }
        }
        async function setControlInt(id, val) {
            try { await CameraChannel.setControlInt(id, val); } catch(e) { statusText.value = e.message; }
        }
        async function setControlInt64(id, val) {
            try { await CameraChannel.setControlInt64(id, val); } catch(e) { statusText.value = e.message; }
        }
        async function setControlBool(id, val) {
            try { await CameraChannel.setControlBool(id, val); } catch(e) { statusText.value = e.message; }
        }
        async function setControlButton(id) {
            try { await CameraChannel.setControlButton(id); } catch(e) { statusText.value = e.message; }
        }
        async function setControlList(id, val) {
            try { await CameraChannel.setControlList(id, val); } catch(e) { statusText.value = e.message; }
        }
        async function setControlIntList(id, val) {
            try { await CameraChannel.setControlIntList(id, val); } catch(e) { statusText.value = e.message; }
        }
        async function setControlString(id, val) {
            try { await CameraChannel.setControlString(id, val); } catch(e) { statusText.value = e.message; }
        }

        // Zoom
        function zoomIn() { zoom.value = Math.min(zoom.value * 1.25, 10); }
        function zoomOut() { zoom.value = Math.max(zoom.value / 1.25, 0.1); }
        function zoomFit() { zoom.value = 1.0; }

        async function saveImage() {
            try {
                await CameraChannel.saveImage('/tmp/v4l2_frame.png', 'png');
                statusText.value = 'Image saved to /tmp/v4l2_frame.png';
            } catch(e) { statusText.value = 'Save failed: ' + e.message; }
        }

        return {
            cameras, selectedCamera, isOpen, isStreaming, frameStreamPort, zoom, statusText,
            exposure, gain, gammaCtrl, brightness, whiteBalance, frameRate,
            pixelFormats, frameSizes, crop, controls, fps, frameInfo,
            toggleOpen, startStream, stopStream,
            setExposure, setAutoExposure, setGain, setAutoGain,
            setGamma, setBrightness, setAutoWhiteBalance,
            setFrameRate, setFrameRateAuto, setPixelFormat, setFrameSizeByIndex,
            setCrop, toggleFlipX, toggleFlipY,
            setControlInt, setControlInt64, setControlBool, setControlButton,
            setControlList, setControlIntList, setControlString,
            zoomIn, zoomOut, zoomFit, saveImage,
        };
    },
});

app.config.globalProperties.Icons = Icons;
app.mount('#app');
