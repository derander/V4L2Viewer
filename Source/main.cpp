/* Allied Vision V4L2Viewer - Graphical Video4Linux Viewer Example
   Copyright (C) 2021 Allied Vision Technologies GmbH

   This program is free software; you can redistribute it and/or
   modify it under the terms of the GNU General Public License
   as published by the Free Software Foundation; either version 2
   of the License, or (at your option) any later version.

   This program is distributed in the hope that it will be useful,
   but WITHOUT ANY WARRANTY; without even the implied warranty of
   MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
   GNU General Public License for more details.

   You should have received a copy of the GNU General Public License
   along with this program; if not, write to the Free Software
   Foundation, Inc., 51 Franklin Street, Fifth Floor, Boston, MA  02110-1301, USA.  */


#include "V4L2Viewer.h"
#include <QDebug>
#include <QFile>
#include <QStyleFactory>
#include <QCommandLineParser>
#include "q_v4l2_ext_ctrl.h"

#include <signal.h>

#ifdef HAS_WEB_UI
#include "WebViewerWindow.h"
#include <QWebEngineView>
#endif

static void signalHandler(int)
{
    QCoreApplication::quit();
}

int main( int argc, char *argv[] )
{
    signal(SIGINT, signalHandler);
    signal(SIGTERM, signalHandler);
    qRegisterMetaType<v4l2_ext_control>();
    QApplication a( argc, argv );

    QCommandLineParser parser;
    parser.setApplicationDescription("V4L2 Viewer");
    parser.addHelpOption();
#ifdef HAS_WEB_UI
    QCommandLineOption webOption("web", "Use web-based UI");
    parser.addOption(webOption);
#endif
    parser.process(a);

#ifdef HAS_WEB_UI
    if (parser.isSet(webOption)) {
        Q_INIT_RESOURCE(V4L2WebViewer);
        WebViewerWindow w;
        w.show();
        return a.exec();
    }
#endif

    // Original widget UI
    a.setStyle(QStyleFactory::create("Fusion"));
    Q_INIT_RESOURCE(V4L2Viewer);

    QFile styleFile(":/Styles/styles/modern-flat.qss");
    if (styleFile.open(QFile::ReadOnly | QFile::Text)) {
        a.setStyleSheet(QString::fromUtf8(styleFile.readAll()));
        styleFile.close();
    }

    V4L2Viewer w;
    w.show();
    return a.exec();
}
