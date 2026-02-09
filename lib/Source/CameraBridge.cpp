#include "CameraBridge.h"
#include "FrameStreamServer.h"
#include "ImageTransform.h"
#include "V4L2Helper.h"

#include <QFile>
#include <QJsonDocument>
#include <QMutexLocker>

#include <cmath>
#include <thread>

CameraBridge::CameraBridge(FrameStreamServer *frameServer, QObject *parent)
    : QObject(parent)
    , m_pFrameServer(frameServer)
{
    m_lastDoneCallback = nullptr;

    // Camera list discovery
    connect(&m_Camera,
            SIGNAL(OnCameraListChanged_Signal(const int &, unsigned int, unsigned long long, const QString &, const QString &)),
            this,
            SLOT(onCameraListChanged(const int &, unsigned int, unsigned long long, const QString &, const QString &)));
    connect(&m_Camera,
            SIGNAL(OnSubDeviceListChanged_Signal(const int &, unsigned int, unsigned long long, const QString &, const QString &)),
            this,
            SLOT(onSubDeviceListChanged(const int &, unsigned int, unsigned long long, const QString &, const QString &)));

    // Auto exposure/gain value feedback
    connect(&m_Camera, SIGNAL(PassAutoExposureValue(int64_t)),
            this, SLOT(onAutoExposureValue(int64_t)));
    connect(&m_Camera, SIGNAL(PassAutoGainValue(int32_t)),
            this, SLOT(onAutoGainValue(int32_t)));

    // Control enumeration signals
    connect(&m_Camera,
            SIGNAL(SendIntDataToEnumerationWidget(int32_t, int32_t, int32_t, int32_t, QString, QString, bool)),
            this,
            SLOT(onIntControlData(int32_t, int32_t, int32_t, int32_t, QString, QString, bool)));
    connect(&m_Camera,
            SIGNAL(SentInt64DataToEnumerationWidget(int32_t, int64_t, int64_t, int64_t, QString, QString, bool)),
            this,
            SLOT(onInt64ControlData(int32_t, int64_t, int64_t, int64_t, QString, QString, bool)));
    connect(&m_Camera,
            SIGNAL(SendBoolDataToEnumerationWidget(int32_t, bool, QString, QString, bool)),
            this,
            SLOT(onBoolControlData(int32_t, bool, QString, QString, bool)));
    connect(&m_Camera,
            SIGNAL(SendButtonDataToEnumerationWidget(int32_t, QString, QString, bool)),
            this,
            SLOT(onButtonControlData(int32_t, QString, QString, bool)));
    connect(&m_Camera,
            SIGNAL(SendListDataToEnumerationWidget(int32_t, int32_t, QList<QString>, QString, QString, bool)),
            this,
            SLOT(onListControlData(int32_t, int32_t, QList<QString>, QString, QString, bool)));
    connect(&m_Camera,
            SIGNAL(SendListIntDataToEnumerationWidget(int32_t, int32_t, QList<int64_t>, QString, QString, bool)),
            this,
            SLOT(onListIntControlData(int32_t, int32_t, QList<int64_t>, QString, QString, bool)));
    connect(&m_Camera,
            SIGNAL(SendStringDataToEnumerationWidget(int32_t, QString, QString, QString, bool)),
            this,
            SLOT(onStringControlData(int32_t, QString, QString, QString, bool)));
    connect(&m_Camera,
            SIGNAL(SendControlStateChange(int32_t, bool)),
            this,
            SLOT(onControlStateChange(int32_t, bool)));
    connect(&m_Camera,
            SIGNAL(SendUpdate(v4l2_ext_control)),
            this,
            SLOT(onControlUpdate(v4l2_ext_control)));

    // Stats timer
    m_statsTimer.setInterval(1000);
    connect(&m_statsTimer, &QTimer::timeout, this, &CameraBridge::onStatsTimer);

    // Start device discovery
    m_Camera.DeviceDiscoveryStart();
    m_Camera.SubDeviceDiscoveryStart();
}

CameraBridge::~CameraBridge()
{
    if (m_bIsStreaming) {
        stopStreaming();
    }
    if (m_bIsOpen) {
        closeCamera();
    }
    m_Camera.DeviceDiscoveryStop();
    m_Camera.SubDeviceDiscoveryStop();
}

int CameraBridge::frameStreamPort() const
{
    return m_pFrameServer->port();
}

QJsonObject CameraBridge::makeResult(bool ok, const QString &error)
{
    QJsonObject obj;
    obj["ok"] = ok;
    if (!error.isEmpty()) {
        obj["error"] = error;
    }
    return obj;
}

uint32_t CameraBridge::pixelFormatFromString(const QString &str)
{
    std::string tmp = str.toStdString();
    if (tmp.size() != 4) return 0;
    const char *s = tmp.c_str();
    uint32_t result = 0;
    result += (uint8_t)s[0];
    result += (uint8_t)s[1] << 8;
    result += (uint8_t)s[2] << 16;
    result += (uint8_t)s[3] << 24;
    return result;
}

// --- Camera list ---

void CameraBridge::onCameraListChanged(const int &reason, unsigned int cardNumber,
                                        unsigned long long deviceID, const QString &deviceName,
                                        const QString &info)
{
    if (reason == UpdateTriggerPluggedIn) {
        bool found = false;
        for (const auto &entry : m_cameraList) {
            if (entry.cardNumber == cardNumber) {
                found = true;
                break;
            }
        }
        if (!found) {
            CameraEntry entry;
            entry.cardNumber = cardNumber;
            entry.deviceName = deviceName;
            entry.info = info;
            m_cameraList.append(entry);
        }
    } else if (reason == UpdateTriggerPluggedOut) {
        for (int i = 0; i < m_cameraList.size(); i++) {
            if (m_cameraList[i].cardNumber == cardNumber) {
                m_cameraList.removeAt(i);
                break;
            }
        }
    }

    emit cameraListChanged(getCameraList());
}

void CameraBridge::onSubDeviceListChanged(const int &reason, unsigned int cardNumber,
                                           unsigned long long deviceID, const QString &deviceName,
                                           const QString &info)
{
    if (reason == UpdateTriggerPluggedIn) {
        if (!m_subDevices.contains(deviceName)) {
            m_subDevices.append(deviceName);
        }
    } else if (reason == UpdateTriggerPluggedOut) {
        m_subDevices.removeAll(deviceName);
    }
}

QJsonObject CameraBridge::getCameraList()
{
    QJsonObject result = makeResult(true);
    QJsonArray cameras;
    for (const auto &entry : m_cameraList) {
        QJsonObject cam;
        cam["index"] = cameras.size();
        cam["cardNumber"] = (int)entry.cardNumber;
        cam["deviceName"] = entry.deviceName;
        cam["info"] = entry.info;
        cam["label"] = QString("Camera: %1 (%2)").arg(entry.deviceName, entry.info);
        cameras.append(cam);
    }
    result["cameras"] = cameras;
    return result;
}

// --- Open / Close ---

QJsonObject CameraBridge::openCamera(int index)
{
    if (m_bIsOpen) {
        return makeResult(false, "Camera already open");
    }
    if (index < 0 || index >= m_cameraList.size()) {
        return makeResult(false, "Invalid camera index");
    }

    const auto &entry = m_cameraList[index];
    std::string devName = entry.deviceName.toStdString();
    QVector<QString> subDevs = m_subDevices;

    int err = m_Camera.OpenDevice(devName, subDevs, m_blockingMode, m_ioMethod, false);
    if (err != 0) {
        return makeResult(false, "Failed to open device (in use or disconnected)");
    }

    m_bIsOpen = true;
    m_openCameraIndex = index;

    // Register frame data processors (mirrors V4L2Viewer.cpp pattern)
    // Processor 1: frame info updates (store atomically, emit on stats timer)
    m_Camera.GetFrameObserver()->AddRawDataProcessor(
        [this](auto const &buf, auto doneCallback) {
            onUpdateFrameInfo(buf.frameID, buf.width, buf.height);
            doneCallback();
        });

    // Processor 2: send frames to WebSocket stream server
    m_Camera.GetFrameObserver()->AddRawDataProcessor(
        [this](auto const &buf, auto doneCallback) {
            if (m_bIsStreaming) {
                m_pFrameServer->pushFrame(buf, doneCallback);
            } else {
                doneCallback();
            }
        });

    // Processor 3: retain last frame for save
    m_Camera.GetFrameObserver()->AddRawDataProcessor(
        [this](auto const &buf, auto doneCallback) {
            if (m_bIsStreaming) {
                QMutexLocker locker(&m_lastFrameMutex);
                if (m_lastDoneCallback) {
                    auto cb = m_lastDoneCallback;
                    m_lastDoneCallback = nullptr;
                    locker.unlock();
                    cb();
                    locker.relock();
                }
                m_lastDoneCallback = doneCallback;
                m_lastFrame = buf;
            } else {
                doneCallback();
            }
        });

    emit openStateChanged(true);
    emit statusMessage("Camera opened: " + entry.deviceName);

    // Read initial camera info
    m_Camera.EnumAllControlNewStyle();
    m_Camera.PrepareFrameRate();
    m_Camera.PrepareCrop();
    m_Camera.PrepareFrameSize();

    return makeResult(true);
}

QJsonObject CameraBridge::closeCamera()
{
    if (!m_bIsOpen) {
        return makeResult(false, "No camera open");
    }

    if (m_bIsStreaming) {
        stopStreaming();
    }

    m_Camera.CloseDevice();
    m_bIsOpen = false;
    m_openCameraIndex = -1;

    // Release retained frame
    {
        QMutexLocker locker(&m_lastFrameMutex);
        if (m_lastDoneCallback) {
            auto cb = m_lastDoneCallback;
            m_lastDoneCallback = nullptr;
            locker.unlock();
            cb();
        }
    }

    emit openStateChanged(false);
    emit statusMessage("Camera closed");
    return makeResult(true);
}

QJsonObject CameraBridge::getDeviceInfo()
{
    if (!m_bIsOpen) {
        return makeResult(false, "No camera open");
    }

    QJsonObject result = makeResult(true);
    std::string text;

    if (m_Camera.GetCameraDriverName(text) == 0)
        result["driver"] = QString::fromStdString(text);
    if (m_Camera.GetCameraDeviceName(text) == 0)
        result["device"] = QString::fromStdString(text);
    if (m_Camera.GetCameraBusInfo(text) == 0)
        result["bus"] = QString::fromStdString(text);
    if (m_Camera.GetCameraDriverVersion(text) == 0)
        result["version"] = QString::fromStdString(text);
    return result;
}

// --- Streaming ---

QJsonObject CameraBridge::startStreaming()
{
    if (!m_bIsOpen) {
        return makeResult(false, "No camera open");
    }
    if (m_bIsStreaming) {
        return makeResult(false, "Already streaming");
    }

    uint32_t payloadSize = 0, width = 0, height = 0, pixelFormat = 0, bytesPerLine = 0;
    QString pixelFormatText;

    m_Camera.ReadPayloadSize(payloadSize);
    m_Camera.ReadFrameSize(width, height);
    int err = m_Camera.ReadPixelFormat(pixelFormat, bytesPerLine, pixelFormatText);
    if (err != 0) {
        return makeResult(false, "Failed to read pixel format");
    }

    if (!ImageTransform::CanConvert(pixelFormat)) {
        return makeResult(false, QString("Pixel format %1 not supported").arg(pixelFormatText));
    }

    ImageTransform::Init(width, height);

    err = m_Camera.CreateUserBuffer(m_numFrames, payloadSize);
    if (err != 0) {
        return makeResult(false, "Failed to create buffers");
    }

    err = m_Camera.QueueAllUserBuffer();
    if (err != 0) {
        m_Camera.DeleteUserBuffer();
        return makeResult(false, "Failed to queue buffers");
    }

    err = m_Camera.StartStreaming();
    if (err != 0) {
        m_Camera.DeleteUserBuffer();
        return makeResult(false, "Failed to start streaming");
    }

    bool logToFile = false;
    err = m_Camera.StartStreamChannel(pixelFormat, payloadSize, width, height,
                                       bytesPerLine, nullptr, logToFile ? 1 : 0);
    if (err != 0) {
        m_Camera.StopStreaming();
        m_Camera.DeleteUserBuffer();
        return makeResult(false, "Failed to start stream channel");
    }

    m_bIsStreaming = true;
    m_statsTimer.start();

    emit streamingStateChanged(true);
    emit statusMessage("Streaming started");
    return makeResult(true);
}

QJsonObject CameraBridge::stopStreaming()
{
    if (!m_bIsStreaming) {
        return makeResult(false, "Not streaming");
    }

    // Set flag first so in-flight processor callbacks release immediately
    m_bIsStreaming = false;
    m_statsTimer.stop();

    // Release retained last frame (processor 3) BEFORE stopping stream
    {
        QMutexLocker locker(&m_lastFrameMutex);
        if (m_lastDoneCallback) {
            auto cb = m_lastDoneCallback;
            m_lastDoneCallback = nullptr;
            locker.unlock();
            cb();
        }
    }

    // Flush FrameStreamServer's pending frame callback BEFORE stopping stream
    m_pFrameServer->flush();

    m_Camera.SwitchFrameTransfer2GUI(false);
    m_Camera.StopStreamChannel();
    m_Camera.StopStreaming();
    m_Camera.DeleteUserBuffer();

    emit streamingStateChanged(false);
    emit statusMessage("Streaming stopped");
    return makeResult(true);
}

// --- Exposure ---

QJsonObject CameraBridge::getExposure()
{
    if (!m_bIsOpen) return makeResult(false, "No camera open");

    QJsonObject result = makeResult(true);

    int64_t value = 0;
    int ret = m_Camera.ReadExposure(value);
    if (ret == -2) {
        result["supported"] = false;
        return result;
    }
    result["supported"] = true;
    result["value"] = (double)value;

    int64_t minVal = 0, maxVal = 0;
    if (m_Camera.ReadMinMaxExposure(minVal, maxVal) != -2) {
        result["min"] = (double)minVal;
        result["max"] = (double)maxVal;
    }

    bool autoExp = false;
    if (m_Camera.ReadAutoExposure(autoExp) != -2) {
        result["autoSupported"] = true;
        result["autoEnabled"] = autoExp;
    } else {
        result["autoSupported"] = false;
    }

    return result;
}

QJsonObject CameraBridge::setExposure(double value)
{
    if (!m_bIsOpen) return makeResult(false, "No camera open");
    int err = m_Camera.SetExposure(static_cast<int64_t>(value));
    return err == 0 ? makeResult(true) : makeResult(false, "Failed to set exposure");
}

QJsonObject CameraBridge::setAutoExposure(bool enabled)
{
    if (!m_bIsOpen) return makeResult(false, "No camera open");
    int err = m_Camera.SetAutoExposure(enabled);
    return err == 0 ? makeResult(true) : makeResult(false, "Failed to set auto exposure");
}

// --- Gain ---

QJsonObject CameraBridge::getGain()
{
    if (!m_bIsOpen) return makeResult(false, "No camera open");

    QJsonObject result = makeResult(true);

    int64_t value = 0;
    int ret = m_Camera.ReadGain(value);
    if (ret == -2) {
        result["supported"] = false;
        return result;
    }
    result["supported"] = true;
    result["value"] = (double)value;

    int64_t minVal = 0, maxVal = 0;
    if (m_Camera.ReadMinMaxGain(minVal, maxVal) != -2) {
        result["min"] = (double)minVal;
        result["max"] = (double)maxVal;
    }

    bool autoGain = false;
    if (m_Camera.ReadAutoGain(autoGain) != -2) {
        result["autoSupported"] = true;
        result["autoEnabled"] = autoGain;
    } else {
        result["autoSupported"] = false;
    }

    return result;
}

QJsonObject CameraBridge::setGain(double value)
{
    if (!m_bIsOpen) return makeResult(false, "No camera open");
    int err = m_Camera.SetGain(static_cast<int64_t>(value));
    return err == 0 ? makeResult(true) : makeResult(false, "Failed to set gain");
}

QJsonObject CameraBridge::setAutoGain(bool enabled)
{
    if (!m_bIsOpen) return makeResult(false, "No camera open");
    int err = m_Camera.SetAutoGain(enabled);
    return err == 0 ? makeResult(true) : makeResult(false, "Failed to set auto gain");
}

// --- Gamma ---

QJsonObject CameraBridge::getGamma()
{
    if (!m_bIsOpen) return makeResult(false, "No camera open");

    QJsonObject result = makeResult(true);

    int32_t value = 0;
    int ret = m_Camera.ReadGamma(value);
    if (ret == -2) {
        result["supported"] = false;
        return result;
    }
    result["supported"] = true;
    result["value"] = value;

    int64_t minVal = 0, maxVal = 0;
    if (m_Camera.ReadMinMaxGamma(minVal, maxVal) != -2) {
        result["min"] = (double)minVal;
        result["max"] = (double)maxVal;
    }

    return result;
}

QJsonObject CameraBridge::setGamma(int value)
{
    if (!m_bIsOpen) return makeResult(false, "No camera open");
    int err = m_Camera.SetGamma(value);
    return err == 0 ? makeResult(true) : makeResult(false, "Failed to set gamma");
}

// --- Brightness ---

QJsonObject CameraBridge::getBrightness()
{
    if (!m_bIsOpen) return makeResult(false, "No camera open");

    QJsonObject result = makeResult(true);

    int32_t value = 0;
    int ret = m_Camera.ReadBrightness(value);
    if (ret == -2) {
        result["supported"] = false;
        return result;
    }
    result["supported"] = true;
    result["value"] = value;

    int32_t minVal = 0, maxVal = 0;
    if (m_Camera.ReadMinMaxBrightness(minVal, maxVal) != -2) {
        result["min"] = minVal;
        result["max"] = maxVal;
    }

    return result;
}

QJsonObject CameraBridge::setBrightness(int value)
{
    if (!m_bIsOpen) return makeResult(false, "No camera open");
    int err = m_Camera.SetBrightness(value);
    return err == 0 ? makeResult(true) : makeResult(false, "Failed to set brightness");
}

// --- White Balance ---

QJsonObject CameraBridge::getWhiteBalance()
{
    if (!m_bIsOpen) return makeResult(false, "No camera open");

    QJsonObject result = makeResult(true);
    result["supported"] = m_Camera.IsAutoWhiteBalanceSupported();

    if (m_Camera.IsAutoWhiteBalanceSupported()) {
        bool autoWB = false;
        m_Camera.ReadAutoWhiteBalance(autoWB);
        result["autoEnabled"] = autoWB;
    }

    return result;
}

QJsonObject CameraBridge::setAutoWhiteBalance(bool enabled)
{
    if (!m_bIsOpen) return makeResult(false, "No camera open");
    int err = m_Camera.SetAutoWhiteBalance(enabled);
    return err == 0 ? makeResult(true) : makeResult(false, "Failed to set auto white balance");
}

// --- Frame Rate ---

QJsonObject CameraBridge::getFrameRate()
{
    if (!m_bIsOpen) return makeResult(false, "No camera open");

    QJsonObject result = makeResult(true);

    uint32_t width = 0, height = 0, pixelFormat = 0, bytesPerLine = 0;
    QString pfText;
    m_Camera.ReadFrameSize(width, height);
    m_Camera.ReadPixelFormat(pixelFormat, bytesPerLine, pfText);

    uint32_t numerator = 0, denominator = 0;
    int ret = m_Camera.ReadFrameRate(numerator, denominator, width, height, pixelFormat);
    if (ret == -2) {
        result["supported"] = false;
        return result;
    }
    result["supported"] = true;

    if (numerator > 0 && denominator > 0) {
        double fps = (double)denominator / (double)numerator;
        result["fps"] = fps;
        result["auto"] = false;
    } else {
        result["fps"] = 0;
        result["auto"] = true;
    }

    return result;
}

QJsonObject CameraBridge::setFrameRate(double hz)
{
    if (!m_bIsOpen) return makeResult(false, "No camera open");
    uint32_t denominator = (uint32_t)hz;
    uint32_t numerator = 1;
    int err = m_Camera.SetFrameRate(numerator, denominator);
    return err == 0 ? makeResult(true) : makeResult(false, "Failed to set frame rate");
}

QJsonObject CameraBridge::setFrameRateAuto(bool enabled)
{
    if (!m_bIsOpen) return makeResult(false, "No camera open");
    if (enabled) {
        int err = m_Camera.SetFrameRate(0, 0);
        return err == 0 ? makeResult(true) : makeResult(false, "Failed to set auto frame rate");
    }
    return makeResult(true);
}

// --- Crop ---

QJsonObject CameraBridge::getCrop()
{
    if (!m_bIsOpen) return makeResult(false, "No camera open");

    QJsonObject result = makeResult(true);
    int32_t x = 0, y = 0;
    uint32_t w = 0, h = 0;
    int ret = m_Camera.ReadCrop(x, y, w, h);
    if (ret == -2) {
        result["supported"] = false;
        return result;
    }
    result["supported"] = true;
    result["x"] = x;
    result["y"] = y;
    result["width"] = (int)w;
    result["height"] = (int)h;
    return result;
}

QJsonObject CameraBridge::setCrop(int x, int y, int w, int h)
{
    if (!m_bIsOpen) return makeResult(false, "No camera open");
    int err = m_Camera.SetCrop(x, y, w, h);
    return err == 0 ? makeResult(true) : makeResult(false, "Failed to set crop");
}

// --- Flip ---

QJsonObject CameraBridge::setFlipX(bool enabled)
{
    if (!m_bIsOpen) return makeResult(false, "No camera open");
    int err = m_Camera.SetReverseX(enabled ? 1 : 0);
    return err == 0 ? makeResult(true) : makeResult(false, "Failed to set flip X");
}

QJsonObject CameraBridge::setFlipY(bool enabled)
{
    if (!m_bIsOpen) return makeResult(false, "No camera open");
    int err = m_Camera.SetReverseY(enabled ? 1 : 0);
    return err == 0 ? makeResult(true) : makeResult(false, "Failed to set flip Y");
}

// --- Format / Size ---

QJsonObject CameraBridge::getPixelFormats()
{
    if (!m_bIsOpen) return makeResult(false, "No camera open");

    QJsonObject result = makeResult(true);

    uint32_t currentFormat = 0, bytesPerLine = 0;
    QString pfText;
    m_Camera.ReadPixelFormat(currentFormat, bytesPerLine, pfText);
    result["current"] = QString::fromStdString(
        v4l2helper::ConvertPixelFormat2String(currentFormat));

    // ReadFormats() emits OnCameraPixelFormat_Signal for each format
    // We collect them via a temporary connection
    QJsonArray formats;
    auto conn = connect(&m_Camera, &Camera::OnCameraPixelFormat_Signal,
                        [&formats](uint32_t fmt) {
        QString name = QString::fromStdString(v4l2helper::ConvertPixelFormat2String(fmt));
        bool supported = ImageTransform::CanConvert(fmt);
        QJsonObject f;
        f["name"] = name;
        f["supported"] = supported;
        formats.append(f);
    });

    m_Camera.ReadFormats();
    disconnect(conn);

    result["formats"] = formats;
    return result;
}

QJsonObject CameraBridge::setPixelFormat(const QString &fmt)
{
    if (!m_bIsOpen) return makeResult(false, "No camera open");
    uint32_t pf = pixelFormatFromString(fmt);
    if (pf == 0) return makeResult(false, "Invalid pixel format string");

    int err = m_Camera.SetPixelFormat(pf, "");
    if (err < 0) return makeResult(false, "Failed to set pixel format");
    return makeResult(true);
}

QJsonObject CameraBridge::getFrameSizes(const QString &fmt)
{
    if (!m_bIsOpen) return makeResult(false, "No camera open");

    uint32_t pf = pixelFormatFromString(fmt);
    QList<QString> sizes = m_Camera.GetFrameSizes(pf);

    QJsonObject result = makeResult(true);
    QJsonArray arr;
    for (const auto &s : sizes) {
        arr.append(s);
    }
    result["sizes"] = arr;
    result["currentIndex"] = m_Camera.GetFrameSizeIndex();
    return result;
}

QJsonObject CameraBridge::setFrameSize(int w, int h)
{
    if (!m_bIsOpen) return makeResult(false, "No camera open");
    int err = m_Camera.SetFrameSize(w, h);
    return err == 0 ? makeResult(true) : makeResult(false, "Failed to set frame size");
}

QJsonObject CameraBridge::setFrameSizeByIndex(int index)
{
    if (!m_bIsOpen) return makeResult(false, "No camera open");
    m_Camera.SetFrameSizeByIndex(index);
    return makeResult(true);
}

// --- Enumerated Controls ---

QJsonObject CameraBridge::enumerateControls()
{
    if (!m_bIsOpen) return makeResult(false, "No camera open");
    m_Camera.EnumAllControlNewStyle();
    return makeResult(true);
}

QJsonObject CameraBridge::setControlInt(int id, int val)
{
    if (!m_bIsOpen) return makeResult(false, "No camera open");
    m_Camera.SetEnumerationControlValue(static_cast<int32_t>(id), static_cast<int32_t>(val));
    return makeResult(true);
}

QJsonObject CameraBridge::setControlInt64(int id, double val)
{
    if (!m_bIsOpen) return makeResult(false, "No camera open");
    m_Camera.SetEnumerationControlValue(static_cast<int32_t>(id), static_cast<int64_t>(val));
    return makeResult(true);
}

QJsonObject CameraBridge::setControlBool(int id, bool val)
{
    if (!m_bIsOpen) return makeResult(false, "No camera open");
    m_Camera.SetEnumerationControlValue(static_cast<int32_t>(id), val);
    return makeResult(true);
}

QJsonObject CameraBridge::setControlButton(int id)
{
    if (!m_bIsOpen) return makeResult(false, "No camera open");
    m_Camera.SetEnumerationControlValue(static_cast<int32_t>(id));
    return makeResult(true);
}

QJsonObject CameraBridge::setControlList(int id, const QString &str)
{
    if (!m_bIsOpen) return makeResult(false, "No camera open");
    m_Camera.SetEnumerationControlValueList(static_cast<int32_t>(id), str.toUtf8().constData());
    return makeResult(true);
}

QJsonObject CameraBridge::setControlIntList(int id, double val)
{
    if (!m_bIsOpen) return makeResult(false, "No camera open");
    m_Camera.SetEnumerationControlValueIntList(static_cast<int32_t>(id), static_cast<int64_t>(val));
    return makeResult(true);
}

QJsonObject CameraBridge::setControlString(int id, const QString &str)
{
    if (!m_bIsOpen) return makeResult(false, "No camera open");
    m_Camera.SetEnumerationControlValueString(static_cast<int32_t>(id), str);
    return makeResult(true);
}

// --- Save ---

QJsonObject CameraBridge::saveImage(const QString &path, const QString &format)
{
    QMutexLocker locker(&m_lastFrameMutex);
    if (!m_lastDoneCallback) {
        return makeResult(false, "No frame available");
    }

    if (format.toLower() == "png") {
        QImage convertedImage;
        ImageTransform::ConvertFrame(m_lastFrame.data, m_lastFrame.length,
                                     m_lastFrame.width, m_lastFrame.height,
                                     m_lastFrame.pixelFormat,
                                     m_lastFrame.payloadSize, m_lastFrame.bytesPerLine,
                                     convertedImage);
        locker.unlock();

        if (convertedImage.save(path, "PNG")) {
            return makeResult(true);
        }
        return makeResult(false, "Failed to save PNG");
    } else if (format.toLower() == "raw") {
        QByteArray data(reinterpret_cast<const char *>(m_lastFrame.data), m_lastFrame.length);
        locker.unlock();

        QFile file(path);
        if (file.open(QIODevice::WriteOnly)) {
            file.write(data);
            file.close();
            return makeResult(true);
        }
        return makeResult(false, "Failed to write raw file");
    }

    return makeResult(false, "Unknown format (use 'png' or 'raw')");
}

// --- Stats ---

QJsonObject CameraBridge::getStats()
{
    QJsonObject result = makeResult(true);
    if (m_bIsStreaming) {
        result["receivedFps"] = m_Camera.GetReceivedFPS();
    }
    return result;
}

void CameraBridge::onStatsTimer()
{
    if (m_bIsStreaming) {
        QJsonObject data;
        data["receivedFps"] = m_Camera.GetReceivedFPS();
        emit statsUpdated(data);

        if (m_frameInfoDirty.exchange(false)) {
            QJsonObject fi;
            fi["frameId"] = (double)m_latestFrameId.load();
            fi["width"] = (int)m_latestWidth.load();
            fi["height"] = (int)m_latestHeight.load();
            emit frameInfoUpdated(fi);
        }
    }
}

// --- Signal slots ---

void CameraBridge::onAutoExposureValue(int64_t value)
{
    emit autoExposureValueChanged(static_cast<double>(value));
}

void CameraBridge::onAutoGainValue(int32_t value)
{
    emit autoGainValueChanged(static_cast<double>(value));
}

void CameraBridge::onIntControlData(int32_t id, int32_t min, int32_t max, int32_t value,
                                     QString name, QString unit, bool readOnly)
{
    QJsonObject data;
    data["id"] = id;
    data["min"] = min;
    data["max"] = max;
    data["value"] = value;
    data["name"] = name;
    data["unit"] = unit;
    data["readOnly"] = readOnly;
    data["type"] = "int";
    emit controlIntDiscovered(data);
}

void CameraBridge::onInt64ControlData(int32_t id, int64_t min, int64_t max, int64_t value,
                                       QString name, QString unit, bool readOnly)
{
    QJsonObject data;
    data["id"] = id;
    data["min"] = (double)min;
    data["max"] = (double)max;
    data["value"] = (double)value;
    data["name"] = name;
    data["unit"] = unit;
    data["readOnly"] = readOnly;
    data["type"] = "int64";
    emit controlInt64Discovered(data);
}

void CameraBridge::onBoolControlData(int32_t id, bool value, QString name, QString unit, bool readOnly)
{
    QJsonObject data;
    data["id"] = id;
    data["value"] = value;
    data["name"] = name;
    data["unit"] = unit;
    data["readOnly"] = readOnly;
    data["type"] = "bool";
    emit controlBoolDiscovered(data);
}

void CameraBridge::onButtonControlData(int32_t id, QString name, QString unit, bool readOnly)
{
    QJsonObject data;
    data["id"] = id;
    data["name"] = name;
    data["unit"] = unit;
    data["readOnly"] = readOnly;
    data["type"] = "button";
    emit controlButtonDiscovered(data);
}

void CameraBridge::onListControlData(int32_t id, int32_t value, QList<QString> list,
                                      QString name, QString unit, bool readOnly)
{
    QJsonObject data;
    data["id"] = id;
    data["value"] = value;
    data["name"] = name;
    data["unit"] = unit;
    data["readOnly"] = readOnly;
    data["type"] = "list";
    QJsonArray items;
    for (const auto &item : list) {
        items.append(item);
    }
    data["items"] = items;
    emit controlListDiscovered(data);
}

void CameraBridge::onListIntControlData(int32_t id, int32_t value, QList<int64_t> list,
                                         QString name, QString unit, bool readOnly)
{
    QJsonObject data;
    data["id"] = id;
    data["value"] = value;
    data["name"] = name;
    data["unit"] = unit;
    data["readOnly"] = readOnly;
    data["type"] = "listInt";
    QJsonArray items;
    for (auto v : list) {
        items.append((double)v);
    }
    data["items"] = items;
    emit controlListDiscovered(data);
}

void CameraBridge::onStringControlData(int32_t id, QString value, QString name,
                                        QString unit, bool readOnly)
{
    QJsonObject data;
    data["id"] = id;
    data["value"] = value;
    data["name"] = name;
    data["unit"] = unit;
    data["readOnly"] = readOnly;
    data["type"] = "string";
    emit controlStringDiscovered(data);
}

void CameraBridge::onControlStateChange(int32_t id, bool enabled)
{
    emit controlStateChanged(id, enabled);
}

void CameraBridge::onControlUpdate(v4l2_ext_control ctrl)
{
    QJsonObject data;
    data["id"] = (int)ctrl.id;
    data["value"] = (double)ctrl.value64;
    emit controlValueChanged(data);
}

void CameraBridge::onUpdateFrameInfo(uint64_t id, uint32_t width, uint32_t height)
{
    // Store latest values — emitted on stats timer to avoid flooding QWebChannel
    m_latestFrameId = id;
    m_latestWidth = width;
    m_latestHeight = height;
    m_frameInfoDirty = true;
}
