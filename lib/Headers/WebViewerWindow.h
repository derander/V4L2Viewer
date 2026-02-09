#ifndef WEBVIEWERWINDOW_H
#define WEBVIEWERWINDOW_H

#include <QMainWindow>

class QWebEngineView;
class QWebChannel;
class CameraBridge;
class FrameStreamServer;

class WebViewerWindow : public QMainWindow
{
    Q_OBJECT

public:
    explicit WebViewerWindow(QWidget *parent = nullptr);
    ~WebViewerWindow();

private:
    QWebEngineView *m_pWebView = nullptr;
    QWebChannel *m_pChannel = nullptr;
    CameraBridge *m_pBridge = nullptr;
    FrameStreamServer *m_pFrameServer = nullptr;
};

#endif // WEBVIEWERWINDOW_H
