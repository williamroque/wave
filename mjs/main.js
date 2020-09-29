const { app, ipcMain } = require('electron');

const Window = require('./window');

const fixPath = require('fix-path');
fixPath();

let mainWindow;

app.on('ready', () => {
    mainWindow = new Window({
        icon: '../assets/icon.png',
        frame: false,
        transparent: false,
        width: 600,
        height: 300,
        resizable: false,
        fullscreen: false,
        backgroundColor: '#171414',
        show: false
    }, 'index.html');
    
    mainWindow.createWindow();
    mainWindow.window.setAlwaysOnTop(true, "floating");
    mainWindow.window.setVisibleOnAllWorkspaces(true);
    mainWindow.window.setFullScreenable(false);

    app.dock.hide();
});

app.on('window-all-closed', () => {
    app.exit(0);
});

app.on('activate', () => {
    if (mainWindow.isNull()) {
        mainWindow.createWindow();
    }
});

ipcMain.on('show-window', () => {
    mainWindow.window.show();
});

ipcMain.on('hide-window', () => {
    mainWindow.window.hide();
});
