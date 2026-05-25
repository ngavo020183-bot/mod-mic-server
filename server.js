const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, { cors: { origin: "*" } });
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.send(`
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Voice Chat Server</title>
        <script src="/socket.io/socket.io.js"></script>
        <style>
            body { font-family: sans-serif; background: #121212; color: #fff; text-align: center; padding: 20px; }
            .container { max-width: 400px; margin: 0 auto; background: #1e1e1e; padding: 20px; border-radius: 10px; }
            h1 { color: #00e676; font-size: 20px; }
            .status { font-weight: bold; margin: 15px 0; padding: 10px; border-radius: 5px; background: #2a2a2a; }
            input[type=range] { width: 100%; accent-color: #00e676; }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>🎙️ MINECRAFT VOICE OVERLAY</h1>
            <div id="status" class="status" style="color: #ff9800;">Đang kết nối...</div>
            <div style="text-align:left; margin-top:20px;">
                <label>🎛️ BỘ LỌC TẠP ÂM: <span id="gate-val" style="color:#00e676;font-weight:bold;">30</span>%</label>
                <input type="range" id="noise-gate" min="0" max="100" value="30">
            </div>
        </div>
        <script>
            const urlParams = new URLSearchParams(window.location.search);
            const username = urlParams.get('user') || "Gamer_" + Math.floor(Math.random() * 1000);
            const statusDiv = document.getElementById('status');
            const gateSlider = document.getElementById('noise-gate');
            const gateVal = document.getElementById('gate-val');
            let threshold = 0.3;
            const socket = io();

            gateSlider.oninput = function() { gateVal.innerText = this.value; threshold = this.value / 100; };
            socket.on('connect', () => { statusDiv.innerText = "Đã nhận mic: " + username; statusDiv.style.color = "#00e676"; startMic(); });

            function startMic() {
                navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
                .then(stream => {
                    const ctx = new (window.AudioContext || window.webkitAudioContext)();
                    const src = ctx.createMediaStreamSource(stream);
                    const proc = ctx.createScriptProcessor(2048, 1, 1);
                    src.connect(proc); proc.connect(ctx.destination);
                    proc.onaudioprocess = (e) => {
                        const data = e.inputBuffer.getChannelData(0);
                        let sum = 0; for (let i=0; i<data.length; i++) sum += data[i]*data[i];
                        let rms = Math.sqrt(sum / data.length);
                        if (rms > threshold) {
                            const buf = new Int16Array(data.length);
                            for (let i=0; i<data.length; i++) buf[i] = Math.min(1, Math.max(-1, data[i])) * 0x7FFF;
                            socket.emit('voice_packet', { user: username, audio: buf.buffer });
                        }
                    };
                }).catch(() => { statusDiv.innerText = "Lỗi cấp quyền Mic!"; statusDiv.style.color = "#f44336"; });
            }

            const speakers = {};
            socket.on('stream_out', (d) => {
                if (d.user === username) return;
                if (!speakers[d.user]) {
                    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
                    const gainNode = audioCtx.createGain(); gainNode.connect(audioCtx.destination);
                    speakers[d.user] = { ctx: audioCtx, gain: gainNode };
                }
                const int16 = new Int16Array(d.audio); const f32 = new Float32Array(int16.length);
                for (let i=0; i<int16.length; i++) f32[i] = int16[i] / 0x7FFF;
                const spk = speakers[d.user];
                const buf = spk.ctx.createBuffer(1, f32.length, spk.ctx.sampleRate); buf.getChannelData(0).set(f32);
                const bufSrc = spk.ctx.createBufferSource(); bufSrc.buffer = buf; bufSrc.connect(spk.gain); bufSrc.start();
            });

            socket.on('volume_update', (d) => { if (speakers[d.targetUser]) speakers[d.targetUser].gain.gain.value = d.volume; });
        </script>
    </body>
    </html>
    `);
});

io.on('connection', (socket) => {
    socket.on('voice_packet', (data) => { socket.broadcast.emit('stream_out', { user: data.user, audio: data.audio }); });
    socket.on('game_sync', (data) => { io.emit('volume_update', { targetUser: data.p1, volume: data.vol }); });
});

http.listen(PORT, () => { console.log(`Voice Server mic running on port ${PORT}`); });
