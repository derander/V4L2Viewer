#include "FrameStreamServer.h"
#include "ImageTransform.h"

#include <QBuffer>
#include <QMutexLocker>

FrameStreamServer::FrameStreamServer(QObject *parent)
    : QObject(parent)
{
    m_pServer = new QWebSocketServer(QStringLiteral("FrameStream"),
                                     QWebSocketServer::NonSecureMode, this);

    // Connect signal for thread-safe WebSocket broadcasting
    connect(this, &FrameStreamServer::broadcastReady,
            this, &FrameStreamServer::onBroadcast, Qt::QueuedConnection);
}

FrameStreamServer::~FrameStreamServer()
{
    stop();
}

int FrameStreamServer::port() const
{
    return m_pServer->serverPort();
}

void FrameStreamServer::start()
{
    if (m_pServer->listen(QHostAddress::LocalHost, 0)) {
        connect(m_pServer, &QWebSocketServer::newConnection,
                this, &FrameStreamServer::onNewConnection);

        m_stopThread = false;
        m_conversionThread = std::make_unique<std::thread>([this] {
            conversionThreadMain();
        });
    }
}

void FrameStreamServer::flush()
{
    // Stop conversion thread and release any pending callback,
    // but keep the WebSocket server listening on the same port
    m_stopThread = true;
    m_frameAvailable.wakeAll();

    if (m_conversionThread && m_conversionThread->joinable()) {
        m_conversionThread->join();
        m_conversionThread.reset();
    }

    {
        QMutexLocker lock(&m_frameMutex);
        if (m_nextDoneCallback) {
            auto cb = m_nextDoneCallback;
            m_nextDoneCallback = nullptr;
            m_bufferReady = false;
            lock.unlock();
            cb();
        }
    }

    // Restart conversion thread for next streaming session
    m_clientReady = true;
    m_stopThread = false;
    m_conversionThread = std::make_unique<std::thread>([this] {
        conversionThreadMain();
    });
}

void FrameStreamServer::stop()
{
    m_stopThread = true;
    m_frameAvailable.wakeAll();

    if (m_conversionThread && m_conversionThread->joinable()) {
        m_conversionThread->join();
        m_conversionThread.reset();
    }

    {
        QMutexLocker lock(&m_frameMutex);
        if (m_nextDoneCallback) {
            auto cb = m_nextDoneCallback;
            m_nextDoneCallback = nullptr;
            m_bufferReady = false;
            lock.unlock();
            cb();
        }
    }

    for (auto *client : m_clients) {
        client->close();
        client->deleteLater();
    }
    m_clients.clear();

    m_pServer->close();
}

void FrameStreamServer::pushFrame(const BufferWrapper &buffer, std::function<void()> doneCallback)
{
    QMutexLocker lock(&m_frameMutex);

    // Release previous frame if still held
    if (m_nextDoneCallback) {
        auto cb = m_nextDoneCallback;
        m_nextDoneCallback = nullptr;
        lock.unlock();
        cb();
        lock.relock();
    }

    m_nextBuffer = buffer;
    m_nextDoneCallback = doneCallback;
    m_bufferReady = true;
    m_frameAvailable.wakeOne();
}

void FrameStreamServer::onNewConnection()
{
    auto *client = m_pServer->nextPendingConnection();
    connect(client, &QWebSocket::disconnected,
            this, &FrameStreamServer::onClientDisconnected);
    connect(client, &QWebSocket::textMessageReceived,
            this, &FrameStreamServer::onClientTextMessage);
    m_clients.append(client);
    m_clientReady = true;
}

void FrameStreamServer::onClientDisconnected()
{
    auto *client = qobject_cast<QWebSocket *>(sender());
    if (client) {
        m_clients.removeAll(client);
        client->deleteLater();
    }
}

void FrameStreamServer::onClientTextMessage(const QString &msg)
{
    if (msg == QStringLiteral("ack")) {
        m_clientReady = true;
    }
}

void FrameStreamServer::onBroadcast(const QByteArray &message)
{
    m_broadcastPending = false;

    if (!m_clientReady)
        return;  // Drop frame — client hasn't finished rendering the previous one

    m_clientReady = false;
    for (auto *client : m_clients) {
        client->sendBinaryMessage(message);
    }
}

void FrameStreamServer::conversionThreadMain()
{
    while (!m_stopThread) {
        m_frameMutex.lock();
        while (!m_bufferReady) {
            m_frameAvailable.wait(&m_frameMutex);
            if (!m_bufferReady && m_stopThread) {
                m_frameMutex.unlock();
                return;
            }
        }

        BufferWrapper buffer = m_nextBuffer;
        auto doneCallback = m_nextDoneCallback;
        m_nextDoneCallback = nullptr;
        m_bufferReady = false;
        m_frameMutex.unlock();

        // Skip conversion entirely if client isn't ready or broadcast pending
        if (!m_clientReady || m_broadcastPending) {
            if (doneCallback) {
                doneCallback();
            }
            continue;
        }

        QImage convertedImage;
        int result = ImageTransform::ConvertFrame(
            buffer.data, buffer.length,
            buffer.width, buffer.height, buffer.pixelFormat,
            buffer.payloadSize, buffer.bytesPerLine, convertedImage);

        // Release buffer back to FrameObserver immediately after conversion
        if (doneCallback) {
            doneCallback();
        }

        if (result != 0 || convertedImage.isNull()) {
            continue;
        }

        // JPEG compress
        QByteArray jpegData;
        QBuffer jpegBuffer(&jpegData);
        jpegBuffer.open(QIODevice::WriteOnly);
        convertedImage.save(&jpegBuffer, "JPEG", 80);
        jpegBuffer.close();

        // Build message: [width:u32][height:u32][frameId:u64][jpeg...]
        QByteArray message;
        message.reserve(16 + jpegData.size());

        uint32_t w = buffer.width;
        uint32_t h = buffer.height;
        uint64_t fid = buffer.frameID;
        message.append(reinterpret_cast<const char *>(&w), 4);
        message.append(reinterpret_cast<const char *>(&h), 4);
        message.append(reinterpret_cast<const char *>(&fid), 8);
        message.append(jpegData);

        // Emit signal — delivery happens on main thread via QueuedConnection
        if (!m_broadcastPending.exchange(true)) {
            emit broadcastReady(message);
        }
        emit frameConverted(buffer.frameID, buffer.width, buffer.height);
    }
}
