#include "WebViewerWindow.h"
#include "CameraBridge.h"
#include "FrameStreamServer.h"

#include <QWebEngineView>
#include <QWebChannel>
#include <QWebEngineSettings>
#include <QWebEnginePage>
#include <QWebEngineProfile>

WebViewerWindow::WebViewerWindow(QWidget *parent)
    : QMainWindow(parent)
{
    setWindowTitle("V4L2 Viewer");
    resize(1280, 800);

    m_pFrameServer = new FrameStreamServer(this);
    m_pFrameServer->start();

    m_pBridge = new CameraBridge(m_pFrameServer, this);

    m_pChannel = new QWebChannel(this);
    m_pChannel->registerObject(QStringLiteral("bridge"), m_pBridge);

    m_pWebView = new QWebEngineView(this);
    m_pWebView->page()->setWebChannel(m_pChannel);

    auto *settings = m_pWebView->settings();
    settings->setAttribute(QWebEngineSettings::LocalContentCanAccessRemoteUrls, true);
    settings->setAttribute(QWebEngineSettings::LocalContentCanAccessFileUrls, true);

    m_pWebView->setUrl(QUrl(QStringLiteral("qrc:/web/index.html")));

    setCentralWidget(m_pWebView);
}

WebViewerWindow::~WebViewerWindow()
{
    m_pFrameServer->stop();
}
