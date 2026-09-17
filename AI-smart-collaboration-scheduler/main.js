// main.js
const { app, BrowserWindow } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

let serverProcess;

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false
    }
  });

  win.loadURL('http://localhost:3000');
}

app.whenReady().then(() => {
  // 啟動 Node Server
  serverProcess = spawn('node', ['server.js'], {
    cwd: __dirname,
    shell: true
  });

  setTimeout(createWindow, 1500);
});

app.on('window-all-closed', () => {
  if (serverProcess) serverProcess.kill();
  app.quit();
});