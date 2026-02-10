#ifndef FRAMESTREAMSERVER_H
#define FRAMESTREAMSERVER_H

#include <QObject>
#include <QWebSocketServer>
#include <QWebSocket>
#include <QImage>

#include <thread>
#include <mutex>
#include <condition_variable>
#include <atomic>
#include <functional>

#include "BufferWrapper.h"

class FrameStreamServer : public QObject
{
    Q_OBJECT

public:
    explicit FrameStreamServer(QObject *parent = nullptr);
    ~FrameStreamServer();

    int port() const;
    void start();
    void stop();
    void flush();

    void pushFrame(const BufferWrapper &buffer, std::function<void()> doneCallback);

signals:
    void frameConverted(uint64_t frameId, uint32_t width, uint32_t height);
    void broadcastReady(const QByteArray &message);

private slots:
    void onNewConnection();
    void onClientDisconnected();
    void onClientTextMessage(const QString &msg);
    void onBroadcast(const QByteArray &message);

private:
    void conversionThreadMain();

    QWebSocketServer *m_pServer = nullptr;
    QList<QWebSocket *> m_clients;

    std::unique_ptr<std::thread> m_conversionThread;
    std::atomic<bool> m_stopThread{false};
    std::atomic<bool> m_broadcastPending{false};
    std::atomic<bool> m_clientReady{true};

    std::mutex m_frameMutex;
    std::condition_variable m_frameAvailable;
    BufferWrapper m_nextBuffer;
    std::function<void()> m_nextDoneCallback;
    bool m_bufferReady = false;
};

#endif // FRAMESTREAMSERVER_H
