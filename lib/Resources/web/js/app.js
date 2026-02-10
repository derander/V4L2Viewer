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
        pinned: { type: Boolean, default: true },
    },
    emits: ['select-camera', 'toggle-open', 'toggle-pin'],
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
        <div class="sidebar" :class="{ collapsed: !pinned }">
            <div class="sidebar-header">
                <div class="sidebar-header-row">
                    <h3 v-if="pinned">Devices</h3>
                    <button class="pin-btn" :class="{ pinned: pinned }" @click="$emit('toggle-pin')"
                            :title="pinned ? 'Unpin sidebar' : 'Pin sidebar'">
                        <span class="icon" v-html="pinned ? Icons.push_pin : Icons.chevron_right"></span>
                    </button>
                </div>
                <div class="search-box" v-if="pinned">
                    <span class="icon" v-html="Icons.search"></span>
                    <input type="text" placeholder="Search cameras..." v-model="searchQuery">
                </div>
            </div>
            <template v-if="pinned">
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
            </template>
        </div>
    `
});

// --- SettingsPanel component ---
const SettingsPanel = defineComponent({
    name: 'SettingsPanel',
    props: {
        show: Boolean,
        recordingFormat: String,
        maxRecordMb: Number,
    },
    emits: ['close', 'update:recordingFormat', 'update:maxRecordMb'],
    template: `
        <div class="settings-modal-backdrop" v-if="show" @click.self="$emit('close')">
            <div class="settings-modal">
                <button class="close-btn" @click="$emit('close')">&times;</button>
                <h3>Settings</h3>
                <div class="settings-field">
                    <label>Recording Format</label>
                    <select :value="recordingFormat" @change="$emit('update:recordingFormat', $event.target.value)">
                        <option value="webm">WebM (VP9 — client-side)</option>
                        <option value="avi">AVI (MJPEG — server-side)</option>
                        <option value="raw">Raw (V4L2 frames — server-side)</option>
                    </select>
                </div>
                <div class="settings-field">
                    <label>Max Recording Size (MB)</label>
                    <input type="number" :value="maxRecordMb" min="1" max="10000" step="1"
                        @change="$emit('update:maxRecordMb', Number($event.target.value))">
                </div>
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
        isRecording: Boolean,
        zoom: Number,
        flipX: Boolean,
        flipY: Boolean,
        isCropped: Boolean,
    },
    emits: ['start-stream', 'stop-stream', 'zoom-in', 'zoom-out', 'zoom-fit', 'save-image', 'flip-x', 'flip-y', 'snapshot', 'reset-crop', 'start-record', 'stop-record', 'toggle-settings'],
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
                <button v-if="!isRecording" class="tool-btn record-btn" @click="$emit('start-record')" :disabled="!isStreaming" title="Start Recording">
                    <span class="icon" v-html="Icons.circle"></span> Record
                </button>
                <button v-else class="tool-btn recording" @click="$emit('stop-record')" title="Stop Recording">
                    <span class="icon" v-html="Icons.stop"></span> Stop Rec
                </button>
                <button v-if="isCropped" class="tool-btn crop-active" @click="$emit('reset-crop')" title="Reset Crop">
                    <span class="icon" v-html="Icons.crop"></span> Reset Crop
                </button>
            </div>
            <div class="toolbar-group">
                <button class="tool-btn" :class="{ active: flipX }" @click="$emit('flip-x')" :disabled="!isOpen" title="Flip Horizontal">
                    <span class="icon" v-html="Icons.flip"></span>
                </button>
                <button class="tool-btn" :class="{ active: flipY }" @click="$emit('flip-y')" :disabled="!isOpen" title="Flip Vertical">
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
                <div class="toolbar-divider"></div>
                <button class="tool-btn" @click="$emit('toggle-settings')" title="Settings">
                    <span class="icon" v-html="Icons.settings"></span>
                </button>
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
        pinned: { type: Boolean, default: true },
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
        'toggle-pin',
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
        <aside class="right-panel" :class="{ collapsed: !pinned }">
            <div class="panel-pin-header">
                <button class="pin-btn" :class="{ pinned: pinned }" @click="$emit('toggle-pin')"
                        :title="pinned ? 'Unpin panel' : 'Pin panel'">
                    <span class="icon" v-html="pinned ? Icons.push_pin : Icons.chevron_left"></span>
                </button>
                <h3 v-if="pinned">Controls</h3>
            </div>
            <template v-if="pinned">
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
            </template>
        </aside>
    `
});

// --- FrameViewer component ---
const FrameViewer = defineComponent({
    name: 'FrameViewer',
    props: {
        isStreaming: Boolean,
        isRecording: Boolean,
        recordingInfo: Object,
        frameStreamPort: Number,
        zoom: Number,
        flipX: Boolean,
        flipY: Boolean,
        fps: Object,
        frameInfo: Object,
        pixelFormats: Object,
        isCropped: Boolean,
    },
    emits: ['apply-crop', 'reset-crop', 'set-zoom'],
    setup(props, { emit }) {
        const canvasRef = ref(null);
        const overlayRef = ref(null);

        // Selection state
        const isDrawing = ref(false);
        const startPoint = ref(null);    // { x, y } in frame pixels
        const selectionRect = ref(null); // { x, y, w, h } in frame pixels
        const activeMode = ref(null);    // null | 'focus' | 'crop' | 'adjust'

        // Context menu
        const showMenu = ref(false);
        const menuPos = ref({ x: 0, y: 0 });

        // Stored rect for overlay info display (persists after crop applies)
        const appliedRect = ref(null);

        // Adjust mode state
        const adjustAction = ref(null);   // null | 'move' | 'n' | 's' | 'e' | 'w' | 'nw' | 'ne' | 'sw' | 'se'
        const adjustStart = ref(null);     // { mx, my, rect: {x,y,w,h} }
        const adjustMoved = ref(false);    // did the mouse actually drag during adjust?
        const overlayCursor = ref('crosshair');
        const EDGE_MARGIN = 8; // pixels in frame-space (scaled by zoom)

        // Focus overlay animation frame handle
        let focusRAF = null;

        watch(() => props.isStreaming, (streaming) => {
            if (streaming && props.frameStreamPort > 0) {
                nextTick(() => {
                    FrameRenderer.onCanvasResize = syncOverlaySize;
                    FrameRenderer.connect(props.frameStreamPort, canvasRef.value);
                });
            } else {
                FrameRenderer.disconnect();
                clearSelection();
            }
        });

        onBeforeUnmount(() => {
            FrameRenderer.disconnect();
            if (focusRAF) cancelAnimationFrame(focusRAF);
        });

        // Sync overlay canvas to video canvas dimensions
        function syncOverlaySize(w, h) {
            const ov = overlayRef.value;
            if (ov && (ov.width !== w || ov.height !== h)) {
                ov.width = w;
                ov.height = h;
            }
        }

        // Convert mouse event to frame-pixel coordinates
        function mouseToFrame(e) {
            const canvas = canvasRef.value;
            if (!canvas) return null;
            const rect = canvas.getBoundingClientRect();
            let mx = (e.clientX - rect.left) * (canvas.width / rect.width);
            let my = (e.clientY - rect.top) * (canvas.height / rect.height);
            if (props.flipX) mx = canvas.width - mx;
            if (props.flipY) my = canvas.height - my;
            return { x: Math.round(mx), y: Math.round(my) };
        }

        // Hit-test: determine what part of the rect the point is on
        function hitTestRect(pt, r) {
            if (!r) return null;
            const m = EDGE_MARGIN / props.zoom; // scale margin by zoom
            const nearTop = Math.abs(pt.y - r.y) < m;
            const nearBot = Math.abs(pt.y - (r.y + r.h)) < m;
            const nearLeft = Math.abs(pt.x - r.x) < m;
            const nearRight = Math.abs(pt.x - (r.x + r.w)) < m;
            const inX = pt.x > r.x - m && pt.x < r.x + r.w + m;
            const inY = pt.y > r.y - m && pt.y < r.y + r.h + m;

            if (nearTop && nearLeft) return 'nw';
            if (nearTop && nearRight) return 'ne';
            if (nearBot && nearLeft) return 'sw';
            if (nearBot && nearRight) return 'se';
            if (nearTop && inX) return 'n';
            if (nearBot && inX) return 's';
            if (nearLeft && inY) return 'w';
            if (nearRight && inY) return 'e';
            if (pt.x > r.x && pt.x < r.x + r.w && pt.y > r.y && pt.y < r.y + r.h) return 'move';
            return null;
        }

        const cursorMap = {
            'move': 'move', 'n': 'n-resize', 's': 's-resize',
            'e': 'e-resize', 'w': 'w-resize',
            'nw': 'nw-resize', 'ne': 'ne-resize',
            'sw': 'sw-resize', 'se': 'se-resize',
        };

        function onMouseDown(e) {
            if (e.button !== 0) return;
            if (showMenu.value) { showMenu.value = false; return; }
            // If in focus mode, clicking dismisses it
            if (activeMode.value === 'focus') { clearSelection(); return; }

            const pt = mouseToFrame(e);
            if (!pt) return;

            // In adjust mode, check if clicking on the rect to move/resize
            if (activeMode.value === 'adjust' && selectionRect.value) {
                const action = hitTestRect(pt, selectionRect.value);
                if (action) {
                    adjustAction.value = action;
                    adjustStart.value = { mx: pt.x, my: pt.y, rect: { ...selectionRect.value } };
                    adjustMoved.value = false;
                    return;
                }
                // Clicked outside rect in adjust mode — start drawing a new one
                activeMode.value = null;
                appliedRect.value = null;
            }

            isDrawing.value = true;
            startPoint.value = pt;
            selectionRect.value = null;
        }

        function onMouseMove(e) {
            const pt = mouseToFrame(e);
            if (!pt) return;

            // Adjust mode: dragging to move/resize
            if (activeMode.value === 'adjust' && adjustAction.value && adjustStart.value) {
                const dx = pt.x - adjustStart.value.mx;
                const dy = pt.y - adjustStart.value.my;
                if (Math.abs(dx) > 2 || Math.abs(dy) > 2) adjustMoved.value = true;
                const orig = adjustStart.value.rect;
                let { x, y, w, h } = orig;

                const act = adjustAction.value;
                if (act === 'move') {
                    x = orig.x + dx;
                    y = orig.y + dy;
                } else {
                    if (act.includes('n')) { y = orig.y + dy; h = orig.h - dy; }
                    if (act.includes('s')) { h = orig.h + dy; }
                    if (act.includes('w')) { x = orig.x + dx; w = orig.w - dx; }
                    if (act.includes('e')) { w = orig.w + dx; }
                }

                // Prevent negative dimensions by flipping
                if (w < 1) { x = x + w; w = Math.abs(w) || 1; }
                if (h < 1) { y = y + h; h = Math.abs(h) || 1; }

                selectionRect.value = { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) };
                appliedRect.value = { ...selectionRect.value };
                drawSelectionRect();
                return;
            }

            // Adjust mode: hover cursor changes
            if (activeMode.value === 'adjust' && selectionRect.value && !isDrawing.value) {
                const action = hitTestRect(pt, selectionRect.value);
                overlayCursor.value = action ? (cursorMap[action] || 'crosshair') : 'crosshair';
                return;
            }

            // Normal drawing
            if (!isDrawing.value || !startPoint.value) return;
            const x = Math.min(startPoint.value.x, pt.x);
            const y = Math.min(startPoint.value.y, pt.y);
            const w = Math.abs(pt.x - startPoint.value.x);
            const h = Math.abs(pt.y - startPoint.value.y);
            selectionRect.value = { x, y, w, h };
            drawSelectionRect();
        }

        function onMouseUp(e) {
            // Finish adjust drag or click-to-open-menu
            if (activeMode.value === 'adjust' && adjustAction.value) {
                const didMove = adjustMoved.value;
                adjustAction.value = null;
                adjustStart.value = null;
                if (!didMove) {
                    // Click without drag inside rect → show context menu
                    menuPos.value = { x: e.clientX, y: e.clientY };
                    showMenu.value = true;
                } else {
                    drawSelectionRect();
                }
                return;
            }

            if (!isDrawing.value) return;
            isDrawing.value = false;
            if (!selectionRect.value || selectionRect.value.w < 4 || selectionRect.value.h < 4) {
                selectionRect.value = null;
                clearOverlay();
                return;
            }
            // Show context menu at mouse position
            menuPos.value = { x: e.clientX, y: e.clientY };
            showMenu.value = true;
        }

        // Right-click to re-open context menu in adjust mode
        function onContextMenu(e) {
            e.preventDefault();
            if (activeMode.value === 'adjust' && selectionRect.value) {
                menuPos.value = { x: e.clientX, y: e.clientY };
                showMenu.value = true;
            }
        }

        // --- Wheel zoom ---
        function onWheel(e) {
            e.preventDefault();
            const delta = e.deltaY > 0 ? -1 : 1;
            const factor = 1 + delta * 0.1;
            const newZoom = Math.min(10, Math.max(0.1, props.zoom * factor));
            emit('set-zoom', newZoom);
        }

        // --- Pinch-to-zoom ---
        let pinchStartDist = 0;
        let pinchStartZoom = 1;

        function getTouchDist(e) {
            const t = e.touches;
            const dx = t[0].clientX - t[1].clientX;
            const dy = t[0].clientY - t[1].clientY;
            return Math.sqrt(dx * dx + dy * dy);
        }

        function onTouchStart(e) {
            if (e.touches.length === 2) {
                e.preventDefault();
                pinchStartDist = getTouchDist(e);
                pinchStartZoom = props.zoom;
            }
        }

        function onTouchMove(e) {
            if (e.touches.length === 2) {
                e.preventDefault();
                const dist = getTouchDist(e);
                const scale = dist / pinchStartDist;
                const newZoom = Math.min(10, Math.max(0.1, pinchStartZoom * scale));
                emit('set-zoom', newZoom);
            }
        }

        function onTouchEnd(e) {
            pinchStartDist = 0;
        }

        function drawSelectionRect() {
            const ov = overlayRef.value;
            if (!ov) return;
            const ctx = ov.getContext('2d');
            ctx.clearRect(0, 0, ov.width, ov.height);
            const r = selectionRect.value;
            if (!r) return;
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 1;
            ctx.setLineDash([4, 3]);
            ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w, r.h);
            ctx.setLineDash([]);
        }

        function clearOverlay() {
            const ov = overlayRef.value;
            if (!ov) return;
            const ctx = ov.getContext('2d');
            ctx.clearRect(0, 0, ov.width, ov.height);
        }

        function clearSelection() {
            selectionRect.value = null;
            appliedRect.value = null;
            activeMode.value = null;
            adjustAction.value = null;
            adjustStart.value = null;
            overlayCursor.value = 'crosshair';
            showMenu.value = false;
            if (focusRAF) { cancelAnimationFrame(focusRAF); focusRAF = null; }
            clearOverlay();
        }

        // --- Adjust mode ---
        function applyAdjust() {
            showMenu.value = false;
            activeMode.value = 'adjust';
            appliedRect.value = { ...selectionRect.value };
            overlayCursor.value = 'crosshair';
            drawSelectionRect();
        }

        // --- Focus mode ---
        function applyFocus() {
            showMenu.value = false;
            activeMode.value = 'focus';
            appliedRect.value = { ...selectionRect.value };
            drawFocusOverlay();
        }

        function drawFocusOverlay() {
            const ov = overlayRef.value;
            const r = selectionRect.value;
            if (!ov || !r) return;
            const ctx = ov.getContext('2d');
            ctx.clearRect(0, 0, ov.width, ov.height);
            // Draw semi-transparent dark wash
            ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
            ctx.fillRect(0, 0, ov.width, ov.height);
            // Cut out the focus rectangle
            ctx.clearRect(r.x, r.y, r.w, r.h);
            // Draw a subtle border around the focus rect
            ctx.strokeStyle = 'rgba(255,255,255,0.5)';
            ctx.lineWidth = 1;
            ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w, r.h);

            // Keep redrawing while in focus mode (overlay persists across frames)
            if (activeMode.value === 'focus') {
                focusRAF = requestAnimationFrame(drawFocusOverlay);
            }
        }

        // --- Crop mode ---
        function applyCrop() {
            showMenu.value = false;
            const r = selectionRect.value;
            if (!r) return;
            // Clamp to frame bounds
            const cw = canvasRef.value ? canvasRef.value.width : r.x + r.w;
            const ch = canvasRef.value ? canvasRef.value.height : r.y + r.h;
            const cx = Math.max(0, r.x);
            const cy = Math.max(0, r.y);
            const crw = Math.min(r.w, cw - cx);
            const crh = Math.min(r.h, ch - cy);

            activeMode.value = 'crop';
            appliedRect.value = { x: cx, y: cy, w: crw, h: crh };
            clearOverlay();

            // Apply software crop in renderer
            FrameRenderer.cropRegion = { x: cx, y: cy, w: crw, h: crh };

            // Emit event so parent can attempt hardware crop
            emit('apply-crop', cx, cy, crw, crh);
            selectionRect.value = null;
        }

        function resetCrop() {
            FrameRenderer.cropRegion = null;
            activeMode.value = null;
            selectionRect.value = null;
            appliedRect.value = null;
            clearOverlay();
            emit('reset-crop');
        }

        function cancelMenu() {
            showMenu.value = false;
            selectionRect.value = null;
            clearOverlay();
        }

        // Watch for crop reset from parent
        watch(() => props.isCropped, (val) => {
            if (!val && activeMode.value === 'crop') {
                FrameRenderer.cropRegion = null;
                activeMode.value = null;
            }
        });

        const canvasStyle = computed(() => {
            const sx = props.zoom * (props.flipX ? -1 : 1);
            const sy = props.zoom * (props.flipY ? -1 : 1);
            const tx = props.flipX ? `${props.zoom * 100}%` : '0';
            const ty = props.flipY ? `${props.zoom * 100}%` : '0';
            return {
                transform: `translate(${tx}, ${ty}) scale(${sx}, ${sy})`,
                transformOrigin: 'top left',
            };
        });

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

        // Rectangle info for overlay badges (show during draw, focus, or crop)
        const displayRect = computed(() => {
            if (selectionRect.value) return selectionRect.value;
            if (appliedRect.value) return appliedRect.value;
            return null;
        });

        const rectPosText = computed(() => {
            const r = displayRect.value;
            if (!r) return null;
            return 'XY: ' + r.x + ', ' + r.y;
        });

        const rectSizeText = computed(() => {
            const r = displayRect.value;
            if (!r) return null;
            return r.w + ' x ' + r.h + ' px';
        });

        const rectModeText = computed(() => {
            if (activeMode.value === 'focus') return 'Focus';
            if (activeMode.value === 'crop') return 'Crop';
            if (activeMode.value === 'adjust') return 'Adjust';
            if (isDrawing.value) return 'Selecting';
            return null;
        });

        const recDurationText = computed(() => {
            if (!props.recordingInfo) return '00:00';
            const sec = Math.floor(props.recordingInfo.elapsedSec || 0);
            const m = Math.floor(sec / 60);
            const s = sec % 60;
            return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
        });

        const recSizeText = computed(() => {
            if (!props.recordingInfo) return '';
            const mb = (props.recordingInfo.bytesWritten || 0) / (1024 * 1024);
            const maxMb = (props.recordingInfo.maxBytes || 0) / (1024 * 1024);
            return mb.toFixed(1) + ' / ' + maxMb.toFixed(0) + ' MB';
        });

        return {
            canvasRef, overlayRef, canvasStyle, overlayCursor, fpsText, resText, fmtText,
            isDrawing, selectionRect, activeMode, showMenu, menuPos,
            rectPosText, rectSizeText, rectModeText, displayRect,
            recDurationText, recSizeText,
            onMouseDown, onMouseMove, onMouseUp, onWheel, onContextMenu,
            onTouchStart, onTouchMove, onTouchEnd,
            applyAdjust, applyFocus, applyCrop, cancelMenu, clearSelection, resetCrop,
        };
    },
    template: `
        <div class="frame-viewer">
            <div class="viewport-overlay" v-if="isStreaming">
                <div class="overlay-badge fps" v-if="fpsText">{{ fpsText }}</div>
                <div class="overlay-badge res" v-if="resText">{{ resText }}</div>
                <div class="overlay-badge fmt" v-if="fmtText">{{ fmtText }}</div>
            </div>
            <div class="recording-overlay" v-if="isRecording">
                <span class="recording-dot"></span>
                <span class="recording-label">REC</span>
                <span class="recording-info">{{ recDurationText }}</span>
                <span class="recording-info">{{ recSizeText }}</span>
            </div>
            <div class="viewport-overlay-bottom" v-if="displayRect">
                <div class="overlay-badge sel-mode" v-if="rectModeText">{{ rectModeText }}</div>
                <div class="overlay-badge sel-pos" v-if="rectPosText">{{ rectPosText }}</div>
                <div class="overlay-badge sel-size" v-if="rectSizeText">{{ rectSizeText }}</div>
            </div>
            <div class="canvas-container">
                <canvas ref="canvasRef" :style="canvasStyle" width="640" height="480"></canvas>
                <canvas ref="overlayRef"
                    class="selection-overlay"
                    :style="[canvasStyle, { cursor: overlayCursor }]"
                    width="640" height="480"
                    v-if="isStreaming"
                    @mousedown="onMouseDown"
                    @mousemove="onMouseMove"
                    @mouseup="onMouseUp"
                    @contextmenu.prevent="onContextMenu"
                    @wheel.prevent="onWheel"
                    @touchstart="onTouchStart"
                    @touchmove="onTouchMove"
                    @touchend="onTouchEnd"
                ></canvas>
                <button v-if="activeMode === 'focus'"
                    class="focus-dismiss-btn" @click="clearSelection"
                    title="Dismiss focus">&times;</button>
                <div class="no-stream-overlay" v-if="!isStreaming">
                    <span class="placeholder-icon" v-html="Icons.camera_alt"></span>
                    <p>No stream active</p>
                    <p class="hint">Open a camera and click Start to begin streaming</p>
                </div>
            </div>

            <div class="rect-context-menu"
                 v-if="showMenu"
                 :style="{ left: menuPos.x + 'px', top: menuPos.y + 'px' }">
                <button @click="applyAdjust">
                    <span class="icon" v-html="Icons.fit_screen"></span> Adjust
                </button>
                <button @click="applyFocus">
                    <span class="icon" v-html="Icons.exposure"></span> Focus
                </button>
                <button @click="applyCrop">
                    <span class="icon" v-html="Icons.crop"></span> Crop
                </button>
                <div class="menu-divider"></div>
                <button @click="cancelMenu">Cancel</button>
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
    components: { TitleBar, Sidebar, Toolbar, ControlPanel, FrameViewer, StatusBar, SettingsPanel },
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

        // Panel pin state
        const sidebarPinned = ref(true);
        const controlsPinned = ref(true);

        // Software crop state
        const isCropped = ref(false);

        // Recording state
        const isRecording = ref(false);
        const recordingFormat = ref('avi');
        const maxRecordMb = ref(200);
        const showSettings = ref(false);
        const recordingInfo = ref(null);

        // WebM recording state
        let mediaRecorder = null;
        let recordedChunks = [];
        let webmRecordStartTime = 0;
        let webmSizeTracker = 0;
        let webmTimerInterval = null;

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

                bridge.recordingStateChanged.connect((recording) => {
                    isRecording.value = recording;
                    if (!recording) {
                        recordingInfo.value = null;
                    }
                });

                bridge.recordingProgress.connect((data) => {
                    recordingInfo.value = data;
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
        function toggleFlipX() {
            flipX.value = !flipX.value;
        }
        function toggleFlipY() {
            flipY.value = !flipY.value;
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

        // Software crop from rectangle selection
        async function applyCropFromSelection(x, y, w, h) {
            isCropped.value = true;
            // Attempt hardware crop if supported
            if (crop.value && crop.value.supported) {
                try { await CameraChannel.setCrop(x, y, w, h); } catch(e) { /* software crop still active */ }
            }
        }

        function resetCrop() {
            isCropped.value = false;
            FrameRenderer.cropRegion = null;
        }

        // Zoom
        function zoomIn() { zoom.value = Math.min(zoom.value * 1.25, 10); }
        function zoomOut() { zoom.value = Math.max(zoom.value / 1.25, 0.1); }
        function zoomFit() { zoom.value = 1.0; }

        async function saveImage() {
            try {
                const result = await CameraChannel.saveImageDialog();
                statusText.value = 'Image saved to ' + (result.path || '');
            } catch(e) {
                if (e.message !== 'Save cancelled') {
                    statusText.value = 'Save failed: ' + e.message;
                }
            }
        }

        // --- Recording ---
        async function startRecord() {
            if (recordingFormat.value === 'webm') {
                startWebmRecording();
            } else {
                try {
                    await CameraChannel.recordDialog(recordingFormat.value, maxRecordMb.value * 1024 * 1024);
                } catch(e) {
                    if (e.message !== 'Recording cancelled') {
                        statusText.value = 'Record failed: ' + e.message;
                    }
                }
            }
        }

        async function stopRecord() {
            if (recordingFormat.value === 'webm') {
                stopWebmRecording();
            } else {
                try {
                    await CameraChannel.stopRecording();
                } catch(e) {
                    statusText.value = 'Stop failed: ' + e.message;
                }
            }
        }

        function startWebmRecording() {
            const frameViewer = document.querySelector('.frame-viewer canvas');
            if (!frameViewer) {
                statusText.value = 'No canvas available for WebM recording';
                return;
            }
            const stream = frameViewer.captureStream(30);
            const mimeType = MediaRecorder.isTypeSupported('video/webm; codecs=vp9')
                ? 'video/webm; codecs=vp9'
                : 'video/webm';

            try {
                mediaRecorder = new MediaRecorder(stream, { mimeType });
            } catch(e) {
                statusText.value = 'WebM recording not supported: ' + e.message;
                return;
            }

            recordedChunks = [];
            webmSizeTracker = 0;
            webmRecordStartTime = Date.now();
            const maxBytes = maxRecordMb.value * 1024 * 1024;

            mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) {
                    recordedChunks.push(e.data);
                    webmSizeTracker += e.data.size;
                    if (maxBytes > 0 && webmSizeTracker >= maxBytes) {
                        stopWebmRecording();
                    }
                }
            };

            mediaRecorder.onstop = () => {
                clearInterval(webmTimerInterval);
                webmTimerInterval = null;
                isRecording.value = false;
                recordingInfo.value = null;

                if (recordedChunks.length > 0) {
                    const blob = new Blob(recordedChunks, { type: mimeType });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    const ts = new Date().toISOString().replace(/[:.]/g, '-');
                    a.href = url;
                    a.download = 'recording_' + ts + '.webm';
                    a.click();
                    URL.revokeObjectURL(url);
                    statusText.value = 'WebM recording saved (' + (webmSizeTracker / (1024*1024)).toFixed(1) + ' MB)';
                }
            };

            mediaRecorder.start(1000); // collect data every second
            isRecording.value = true;
            recordingInfo.value = { bytesWritten: 0, elapsedSec: 0, maxBytes: maxBytes };

            webmTimerInterval = setInterval(() => {
                const elapsed = (Date.now() - webmRecordStartTime) / 1000;
                recordingInfo.value = {
                    bytesWritten: webmSizeTracker,
                    elapsedSec: elapsed,
                    maxBytes: maxBytes,
                };
            }, 500);

            statusText.value = 'WebM recording started';
        }

        function stopWebmRecording() {
            if (mediaRecorder && mediaRecorder.state !== 'inactive') {
                mediaRecorder.stop();
            }
            mediaRecorder = null;
        }

        return {
            cameras, selectedCamera, isOpen, isStreaming, frameStreamPort, zoom, statusText,
            exposure, gain, gammaCtrl, brightness, whiteBalance, frameRate,
            pixelFormats, frameSizes, crop, controls, fps, frameInfo, flipX, flipY,
            sidebarPinned, controlsPinned, isCropped,
            isRecording, recordingFormat, maxRecordMb, showSettings, recordingInfo,
            toggleOpen, startStream, stopStream, applyCropFromSelection, resetCrop,
            setExposure, setAutoExposure, setGain, setAutoGain,
            setGamma, setBrightness, setAutoWhiteBalance,
            setFrameRate, setFrameRateAuto, setPixelFormat, setFrameSizeByIndex,
            setCrop, toggleFlipX, toggleFlipY,
            setControlInt, setControlInt64, setControlBool, setControlButton,
            setControlList, setControlIntList, setControlString,
            zoomIn, zoomOut, zoomFit, saveImage,
            startRecord, stopRecord,
        };
    },
});

app.config.globalProperties.Icons = Icons;
app.mount('#app');
