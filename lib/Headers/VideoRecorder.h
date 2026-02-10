#ifndef VIDEORECORDER_H
#define VIDEORECORDER_H

#include <QObject>
#include <QFile>
#include <QElapsedTimer>
#include <QByteArray>
#include <QString>

#include <mutex>
#include <cstdint>

class VideoRecorder : public QObject
{
    Q_OBJECT

public:
    enum Format { AVI_MJPEG, RAW };

    explicit VideoRecorder(QObject *parent = nullptr);
    ~VideoRecorder();

    bool start(const QString &path, Format fmt, uint32_t width, uint32_t height,
               double fps, qint64 maxBytes);
    bool writeJpegFrame(const QByteArray &jpeg);
    bool writeRawFrame(const uint8_t *data, size_t len);
    void stop();

    qint64 bytesWritten() const;
    bool isRecording() const;

signals:
    void recordingProgress(qint64 bytesWritten, double elapsedSec);
    void recordingStopped(const QString &reason);

private:
    void writeAviHeader(bool finalize);
    void checkSizeLimit();

    std::mutex m_mutex;
    QFile m_file;
    Format m_format = AVI_MJPEG;
    bool m_recording = false;
    qint64 m_bytesWritten = 0;
    qint64 m_maxBytes = 0;
    uint32_t m_width = 0;
    uint32_t m_height = 0;
    double m_fps = 30.0;
    uint32_t m_frameCount = 0;
    QElapsedTimer m_elapsed;

    // AVI index: offset and size of each frame chunk
    struct AviIndexEntry {
        uint32_t offset; // offset from start of 'movi' list data
        uint32_t size;   // size of JPEG data (not including chunk header)
    };
    QVector<AviIndexEntry> m_aviIndex;
    qint64 m_moviStart = 0; // file position of 'movi' list data start
};

#endif // VIDEORECORDER_H
