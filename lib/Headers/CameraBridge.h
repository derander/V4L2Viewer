#ifndef CAMERABRIGE_H
#define CAMERABRIGE_H

#include <QObject>
#include <QJsonObject>
#include <QJsonArray>
#include <QTimer>
#include <QMutex>

#include "Camera.h"
#include "BufferWrapper.h"

class FrameStreamServer;

class CameraBridge : public QObject
{
    Q_OBJECT
    Q_PROPERTY(bool isOpen READ isOpen NOTIFY openStateChanged)
    Q_PROPERTY(bool isStreaming READ isStreaming NOTIFY streamingStateChanged)
    Q_PROPERTY(int frameStreamPort READ frameStreamPort CONSTANT)

public:
    explicit CameraBridge(FrameStreamServer *frameServer, QObject *parent = nullptr);
    ~CameraBridge();

    bool isOpen() const { return m_bIsOpen; }
    bool isStreaming() const { return m_bIsStreaming; }
    int frameStreamPort() const;

    // Device management
    Q_INVOKABLE QJsonObject getCameraList();
    Q_INVOKABLE QJsonObject openCamera(int index);
    Q_INVOKABLE QJsonObject closeCamera();
    Q_INVOKABLE QJsonObject getDeviceInfo();

    // Streaming
    Q_INVOKABLE QJsonObject startStreaming();
    Q_INVOKABLE QJsonObject stopStreaming();

    // Exposure
    Q_INVOKABLE QJsonObject getExposure();
    Q_INVOKABLE QJsonObject setExposure(double value);
    Q_INVOKABLE QJsonObject setAutoExposure(bool enabled);

    // Gain
    Q_INVOKABLE QJsonObject getGain();
    Q_INVOKABLE QJsonObject setGain(double value);
    Q_INVOKABLE QJsonObject setAutoGain(bool enabled);

    // Gamma
    Q_INVOKABLE QJsonObject getGamma();
    Q_INVOKABLE QJsonObject setGamma(int value);

    // Brightness
    Q_INVOKABLE QJsonObject getBrightness();
    Q_INVOKABLE QJsonObject setBrightness(int value);

    // White balance
    Q_INVOKABLE QJsonObject getWhiteBalance();
    Q_INVOKABLE QJsonObject setAutoWhiteBalance(bool enabled);

    // Frame rate
    Q_INVOKABLE QJsonObject getFrameRate();
    Q_INVOKABLE QJsonObject setFrameRate(double hz);
    Q_INVOKABLE QJsonObject setFrameRateAuto(bool enabled);

    // Crop
    Q_INVOKABLE QJsonObject getCrop();
    Q_INVOKABLE QJsonObject setCrop(int x, int y, int w, int h);

    // Flip
    Q_INVOKABLE QJsonObject setFlipX(bool enabled);
    Q_INVOKABLE QJsonObject setFlipY(bool enabled);

    // Format / Size
    Q_INVOKABLE QJsonObject getPixelFormats();
    Q_INVOKABLE QJsonObject setPixelFormat(const QString &fmt);
    Q_INVOKABLE QJsonObject getFrameSizes(const QString &fmt);
    Q_INVOKABLE QJsonObject setFrameSize(int w, int h);
    Q_INVOKABLE QJsonObject setFrameSizeByIndex(int index);

    // Enumerated controls
    Q_INVOKABLE QJsonObject enumerateControls();
    Q_INVOKABLE QJsonObject setControlInt(int id, int val);
    Q_INVOKABLE QJsonObject setControlInt64(int id, double val);
    Q_INVOKABLE QJsonObject setControlBool(int id, bool val);
    Q_INVOKABLE QJsonObject setControlButton(int id);
    Q_INVOKABLE QJsonObject setControlList(int id, const QString &str);
    Q_INVOKABLE QJsonObject setControlIntList(int id, double val);
    Q_INVOKABLE QJsonObject setControlString(int id, const QString &str);

    // Utility
    Q_INVOKABLE QJsonObject saveImage(const QString &path, const QString &format);
    Q_INVOKABLE QJsonObject saveImageDialog();
    Q_INVOKABLE QJsonObject getStats();

signals:
    void cameraListChanged(const QJsonObject &data);
    void openStateChanged(bool open);
    void streamingStateChanged(bool streaming);
    void frameInfoUpdated(const QJsonObject &data);
    void statsUpdated(const QJsonObject &data);
    void autoExposureValueChanged(double value);
    void autoGainValueChanged(double value);
    void controlIntDiscovered(const QJsonObject &data);
    void controlInt64Discovered(const QJsonObject &data);
    void controlBoolDiscovered(const QJsonObject &data);
    void controlButtonDiscovered(const QJsonObject &data);
    void controlListDiscovered(const QJsonObject &data);
    void controlStringDiscovered(const QJsonObject &data);
    void controlValueChanged(const QJsonObject &data);
    void controlStateChanged(int id, bool enabled);
    void errorOccurred(const QString &message);
    void statusMessage(const QString &message);

private slots:
    void onCameraListChanged(const int &reason, unsigned int cardNumber,
                             unsigned long long deviceID, const QString &deviceName,
                             const QString &info);
    void onSubDeviceListChanged(const int &reason, unsigned int cardNumber,
                                unsigned long long deviceID, const QString &deviceName,
                                const QString &info);
    void onAutoExposureValue(int64_t value);
    void onAutoGainValue(int32_t value);
    void onIntControlData(int32_t id, int32_t min, int32_t max, int32_t value,
                          QString name, QString unit, bool readOnly);
    void onInt64ControlData(int32_t id, int64_t min, int64_t max, int64_t value,
                            QString name, QString unit, bool readOnly);
    void onBoolControlData(int32_t id, bool value, QString name, QString unit, bool readOnly);
    void onButtonControlData(int32_t id, QString name, QString unit, bool readOnly);
    void onListControlData(int32_t id, int32_t value, QList<QString> list,
                           QString name, QString unit, bool readOnly);
    void onListIntControlData(int32_t id, int32_t value, QList<int64_t> list,
                              QString name, QString unit, bool readOnly);
    void onStringControlData(int32_t id, QString value, QString name, QString unit, bool readOnly);
    void onControlStateChange(int32_t id, bool enabled);
    void onControlUpdate(v4l2_ext_control ctrl);
    void onUpdateFrameInfo(uint64_t id, uint32_t width, uint32_t height);
    void onStatsTimer();

private:
    QJsonObject makeResult(bool ok, const QString &error = QString());
    uint32_t pixelFormatFromString(const QString &str);

    Camera m_Camera;
    FrameStreamServer *m_pFrameServer;
    bool m_bIsOpen = false;
    bool m_bIsStreaming = false;

    struct CameraEntry {
        uint32_t cardNumber;
        QString deviceName;
        QString info;
    };
    QVector<CameraEntry> m_cameraList;
    QVector<QString> m_subDevices;
    int m_openCameraIndex = -1;

    QTimer m_statsTimer;

    QMutex m_lastFrameMutex;
    BufferWrapper m_lastFrame;
    std::function<void()> m_lastDoneCallback;

    bool m_blockingMode = true;
    IO_METHOD_TYPE m_ioMethod = IO_METHOD_USERPTR;
    int32_t m_numFrames = 5;
    int m_savedFrameCounter = 0;

    // Throttled frame info — updated per-frame, emitted on stats timer
    std::atomic<uint64_t> m_latestFrameId{0};
    std::atomic<uint32_t> m_latestWidth{0};
    std::atomic<uint32_t> m_latestHeight{0};
    std::atomic<bool> m_frameInfoDirty{false};
};

#endif // CAMERABRIGE_H
