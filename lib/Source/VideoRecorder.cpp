#include "VideoRecorder.h"

#include <QDataStream>

// Little-endian helpers
static void writeU32LE(QFile &f, uint32_t v)
{
    char buf[4];
    buf[0] = v & 0xFF;
    buf[1] = (v >> 8) & 0xFF;
    buf[2] = (v >> 16) & 0xFF;
    buf[3] = (v >> 24) & 0xFF;
    f.write(buf, 4);
}

static void writeFourCC(QFile &f, const char *cc)
{
    f.write(cc, 4);
}

static void writeU16LE(QFile &f, uint16_t v)
{
    char buf[2];
    buf[0] = v & 0xFF;
    buf[1] = (v >> 8) & 0xFF;
    f.write(buf, 2);
}

VideoRecorder::VideoRecorder(QObject *parent)
    : QObject(parent)
{
}

VideoRecorder::~VideoRecorder()
{
    if (m_recording) {
        stop();
    }
}

bool VideoRecorder::start(const QString &path, Format fmt, uint32_t width, uint32_t height,
                           double fps, qint64 maxBytes)
{
    std::lock_guard<std::mutex> lock(m_mutex);
    if (m_recording) return false;

    m_file.setFileName(path);
    if (!m_file.open(QIODevice::WriteOnly)) {
        return false;
    }

    m_format = fmt;
    m_width = width;
    m_height = height;
    m_fps = fps > 0 ? fps : 30.0;
    m_maxBytes = maxBytes;
    m_bytesWritten = 0;
    m_frameCount = 0;
    m_aviIndex.clear();
    m_moviStart = 0;

    if (fmt == AVI_MJPEG) {
        // Write placeholder AVI header — will be finalized on stop()
        writeAviHeader(false);
    } else {
        // RAW: write text header
        QString header = QString("V4L2RAW\n"
                                 "width=%1\n"
                                 "height=%2\n"
                                 "bytesPerFrame=0\n"
                                 "frameCount=0\n"
                                 "END\n").arg(width).arg(height);
        QByteArray hdr = header.toUtf8();
        m_file.write(hdr);
        m_bytesWritten = hdr.size();
    }

    m_recording = true;
    m_elapsed.start();
    return true;
}

bool VideoRecorder::writeJpegFrame(const QByteArray &jpeg)
{
    std::lock_guard<std::mutex> lock(m_mutex);
    if (!m_recording || m_format != AVI_MJPEG) return false;

    uint32_t chunkSize = jpeg.size();
    uint32_t paddedSize = (chunkSize + 1) & ~1u; // pad to even

    // Record index entry (offset relative to movi list data start)
    AviIndexEntry entry;
    entry.offset = static_cast<uint32_t>(m_file.pos() - m_moviStart);
    entry.size = chunkSize;
    m_aviIndex.append(entry);

    // Write chunk: '00dc' + size + data [+ pad byte]
    writeFourCC(m_file, "00dc");
    writeU32LE(m_file, chunkSize);
    m_file.write(jpeg);

    if (paddedSize > chunkSize) {
        char pad = 0;
        m_file.write(&pad, 1);
    }

    m_bytesWritten = m_file.pos();
    m_frameCount++;

    // Emit progress every 10 frames
    if (m_frameCount % 10 == 0) {
        double elapsed = m_elapsed.elapsed() / 1000.0;
        emit recordingProgress(m_bytesWritten, elapsed);
    }

    checkSizeLimit();
    return true;
}

bool VideoRecorder::writeRawFrame(const uint8_t *data, size_t len)
{
    std::lock_guard<std::mutex> lock(m_mutex);
    if (!m_recording || m_format != RAW) return false;

    m_file.write(reinterpret_cast<const char *>(data), len);
    m_bytesWritten = m_file.pos();
    m_frameCount++;

    if (m_frameCount % 10 == 0) {
        double elapsed = m_elapsed.elapsed() / 1000.0;
        emit recordingProgress(m_bytesWritten, elapsed);
    }

    checkSizeLimit();
    return true;
}

void VideoRecorder::stop()
{
    std::lock_guard<std::mutex> lock(m_mutex);
    if (!m_recording) return;

    m_recording = false;

    if (m_format == AVI_MJPEG) {
        // Write AVI index chunk (idx1)
        writeFourCC(m_file, "idx1");
        writeU32LE(m_file, m_aviIndex.size() * 16);
        for (const auto &entry : m_aviIndex) {
            writeFourCC(m_file, "00dc");
            writeU32LE(m_file, 0x10); // AVIIF_KEYFRAME
            writeU32LE(m_file, entry.offset);
            writeU32LE(m_file, entry.size);
        }

        // Seek back and finalize the header with correct frame count and sizes
        writeAviHeader(true);
    } else {
        // RAW: seek back and update header with frame count and bytes per frame
        m_file.seek(0);
        size_t bytesPerFrame = m_frameCount > 0
            ? (m_bytesWritten - 0) / m_frameCount  // approximate
            : 0;
        QString header = QString("V4L2RAW\n"
                                 "width=%1\n"
                                 "height=%2\n"
                                 "bytesPerFrame=%3\n"
                                 "frameCount=%4\n"
                                 "END\n")
                             .arg(m_width).arg(m_height)
                             .arg(bytesPerFrame).arg(m_frameCount);
        m_file.write(header.toUtf8());
    }

    m_file.close();
    emit recordingStopped("complete");
}

qint64 VideoRecorder::bytesWritten() const
{
    return m_bytesWritten;
}

bool VideoRecorder::isRecording() const
{
    return m_recording;
}

void VideoRecorder::checkSizeLimit()
{
    // Called with m_mutex held
    if (m_maxBytes > 0 && m_bytesWritten >= m_maxBytes) {
        m_recording = false;

        if (m_format == AVI_MJPEG) {
            writeFourCC(m_file, "idx1");
            writeU32LE(m_file, m_aviIndex.size() * 16);
            for (const auto &entry : m_aviIndex) {
                writeFourCC(m_file, "00dc");
                writeU32LE(m_file, 0x10);
                writeU32LE(m_file, entry.offset);
                writeU32LE(m_file, entry.size);
            }
            writeAviHeader(true);
        }

        m_file.close();
        emit recordingStopped("size_limit");
    }
}

void VideoRecorder::writeAviHeader(bool finalize)
{
    // AVI RIFF structure:
    // RIFF('AVI '
    //   LIST('hdrl'
    //     'avih'(MainAVIHeader)
    //     LIST('strl'
    //       'strh'(AVIStreamHeader)
    //       'strf'(BITMAPINFOHEADER)
    //     )
    //   )
    //   LIST('movi'
    //     '00dc'(frame data)...
    //   )
    //   'idx1'(index)
    // )

    uint32_t usPerFrame = static_cast<uint32_t>(1000000.0 / m_fps);

    if (finalize) {
        // Calculate total file size (excluding first 8 bytes: 'RIFF' + size)
        qint64 fileSize = m_file.pos();
        uint32_t riffSize = static_cast<uint32_t>(fileSize - 8);

        // Calculate movi list size
        uint32_t moviDataSize = static_cast<uint32_t>(m_moviStart > 0
            ? (fileSize - m_moviStart - m_aviIndex.size() * 16 - 8 /* idx1 header */)
            : 0);
        // moviDataSize includes all chunk headers+data from movi start to idx1

        m_file.seek(0);
    }

    // RIFF header
    writeFourCC(m_file, "RIFF");
    if (finalize) {
        uint32_t riffSize = static_cast<uint32_t>(m_file.size() - 8);
        writeU32LE(m_file, riffSize);
    } else {
        writeU32LE(m_file, 0); // placeholder
    }
    writeFourCC(m_file, "AVI ");

    // LIST hdrl
    writeFourCC(m_file, "LIST");
    uint32_t hdrlSize = 4 + (8 + 56) + (4 + 8 + (8 + 56) + (8 + 40));
    // hdrl = 'hdrl'(4) + avih chunk(8+56) + LIST strl(4+8 + strh(8+56) + strf(8+40))
    // LIST strl size = 4 + (8+56) + (8+40) = 116
    hdrlSize = 4 + (8 + 56) + (8 + 116);
    writeU32LE(m_file, hdrlSize);
    writeFourCC(m_file, "hdrl");

    // avih (Main AVI Header)
    writeFourCC(m_file, "avih");
    writeU32LE(m_file, 56); // size of avih data
    writeU32LE(m_file, usPerFrame);           // dwMicroSecPerFrame
    writeU32LE(m_file, 0);                     // dwMaxBytesPerSec (not critical)
    writeU32LE(m_file, 0);                     // dwPaddingGranularity
    writeU32LE(m_file, 0x10);                  // dwFlags = AVIF_HASINDEX
    writeU32LE(m_file, m_frameCount);          // dwTotalFrames
    writeU32LE(m_file, 0);                     // dwInitialFrames
    writeU32LE(m_file, 1);                     // dwStreams
    writeU32LE(m_file, 0);                     // dwSuggestedBufferSize
    writeU32LE(m_file, m_width);               // dwWidth
    writeU32LE(m_file, m_height);              // dwHeight
    writeU32LE(m_file, 0);                     // dwReserved[0]
    writeU32LE(m_file, 0);                     // dwReserved[1]
    writeU32LE(m_file, 0);                     // dwReserved[2]
    writeU32LE(m_file, 0);                     // dwReserved[3]

    // LIST strl
    writeFourCC(m_file, "LIST");
    writeU32LE(m_file, 116); // strl list size
    writeFourCC(m_file, "strl");

    // strh (Stream Header)
    writeFourCC(m_file, "strh");
    writeU32LE(m_file, 56); // size
    writeFourCC(m_file, "vids");              // fccType
    writeFourCC(m_file, "MJPG");              // fccHandler
    writeU32LE(m_file, 0);                     // dwFlags
    writeU16LE(m_file, 0);                     // wPriority
    writeU16LE(m_file, 0);                     // wLanguage
    writeU32LE(m_file, 0);                     // dwInitialFrames
    writeU32LE(m_file, 1);                     // dwScale
    writeU32LE(m_file, static_cast<uint32_t>(m_fps)); // dwRate
    writeU32LE(m_file, 0);                     // dwStart
    writeU32LE(m_file, m_frameCount);          // dwLength (total frames)
    writeU32LE(m_file, 0);                     // dwSuggestedBufferSize
    writeU32LE(m_file, 0xFFFFFFFF);            // dwQuality (-1)
    writeU32LE(m_file, 0);                     // dwSampleSize
    writeU16LE(m_file, 0);                     // rcFrame.left
    writeU16LE(m_file, 0);                     // rcFrame.top
    writeU16LE(m_file, static_cast<uint16_t>(m_width));  // rcFrame.right
    writeU16LE(m_file, static_cast<uint16_t>(m_height)); // rcFrame.bottom

    // strf (BITMAPINFOHEADER)
    writeFourCC(m_file, "strf");
    writeU32LE(m_file, 40); // size
    writeU32LE(m_file, 40);                    // biSize
    writeU32LE(m_file, m_width);               // biWidth
    writeU32LE(m_file, m_height);              // biHeight
    writeU16LE(m_file, 1);                     // biPlanes
    writeU16LE(m_file, 24);                    // biBitCount
    writeFourCC(m_file, "MJPG");              // biCompression
    writeU32LE(m_file, m_width * m_height * 3); // biSizeImage
    writeU32LE(m_file, 0);                     // biXPelsPerMeter
    writeU32LE(m_file, 0);                     // biYPelsPerMeter
    writeU32LE(m_file, 0);                     // biClrUsed
    writeU32LE(m_file, 0);                     // biClrImportant

    // LIST movi
    writeFourCC(m_file, "LIST");
    if (finalize && m_moviStart > 0) {
        // Calculate movi data size: everything from movi list data start
        // to just before idx1
        qint64 idx1Start = m_file.size() - (m_aviIndex.size() * 16 + 8);
        uint32_t moviSize = static_cast<uint32_t>(idx1Start - m_moviStart + 4); // +4 for 'movi' fourcc
        writeU32LE(m_file, moviSize);
    } else {
        writeU32LE(m_file, 0); // placeholder
    }
    writeFourCC(m_file, "movi");

    if (!finalize) {
        m_moviStart = m_file.pos(); // Record start of movi data
    }
}
