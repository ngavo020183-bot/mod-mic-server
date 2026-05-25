const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

const PORT = process.env.PORT || 3000;

// Giao diện Web Client chạy trên điện thoại (Chrome)
app.get('/', (req, res) => {
    res.send(`
    <!DOCTYPE html>
    <html lang="vi">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Minecraft PE Voice Chat Server</title>
        <script src="/socket.io/socket.io.js"></script>
        <style>
            body { font-family: sans-serif; background: #121212; color: #fff; text-align: center; padding: 20px; }
            .container { max-width: 400px; margin: 0 auto; background: #1e1e1e; padding: 20px; border-radius: 10px; box-shadow: 0 4px 10px rgba(0,0,0,0.5); }
            h1 { color: #00e676; font-size: 20px; }
            .status { font-weight: bold; margin: 15px 0; padding: 10px; border-radius: 5px; background: #2a2a2a; }
            .slider-box { margin-top: 25px; text-align: left; }
            label { font-size: 14px; color: #aaa; }
            input[type=range] { width: 100%; margin-top: 8px; accent-color: #00e676; }
            .value { float: right; color: #00e676; font-weight: bold; }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>🎙️ MINECRAFT VOICE OVERLAY</h1>
            <div id="status" class="status" style="color: #ff9800;">Đang kết nối hệ thống...</div>
            
            <div class="slider-box">
                <label>🎛️ BỘ LỌC TẠP ÂM (NOISE GATE): 
                    <span id="gate-val" class="value">30</span>
                </label>
                <input type="range" id="noise-gate" min="0" max="100" value="30">
                <small style="color:#666; display:block; margin-top:5px;">Kéo lên cao nếu mic của bạn bị rè hoặc dính tiếng ồn xung quanh.</small>
            </div>
        </div>

        <script>
            const urlParams = new URLSearchParams(window.location.search);
            const username = urlParams.get('user') || "Gamer_" + Math.floor(Math.random() * 1000);
            const statusDiv = document.getElementById('status');
            const gateSlider = document.getElementById('noise-gate');
            const gateVal = document.getElementById('gate-val');

            let noiseGateThreshold = 0.3; // Mặc định 30%
            const socket = io();

            gateSlider.oninput = function() {
                gateVal.innerText = this.value;
                noiseGateThreshold = this.value / 100;
            };

            socket.on('connect', () => {
                statusDiv.innerText = "Đã nhận mic thành công: " + username;
                statusDiv.style.color = "#00e676";
                startAudioContext();
            });

            function startAudioContext() {
                navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
                .then(stream => {
                    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
                    const source = audioContext.createMediaStreamSource(stream);
                    const processor = audioContext.createScriptProcessor(2048, 1, 1);

                    source.connect(processor);
                    processor.connect(audioContext.destination);

                    processor.onaudioprocess = (e) => {
                        const inputData = e.inputBuffer.getChannelData(0);
                        
                        // Tính toán độ lớn âm thanh đầu vào (RMS)
                        let sum = 0;
                        for (let i = 0; i < inputData.length; i++) {
                            sum += inputData[i] * inputData[i];
                        }
                        let rms = Math.sqrt(sum / inputData.length);

                        // BỘ LỌC TẠP ÂM: Chỉ gửi âm thanh đi nếu vượt qua ngưỡng lọc (Noise Gate)
                        if (rms > noiseGateThreshold) {
                            // Chuyển mảng Float32 sang Int16 để nén dung lượng truyền qua mạng
                            const buffer = new Int16Array(inputData.length);
                            for (let i = 0; i < inputData.length; i++) {
                                buffer[i] = Math.min(1, Math.max(-1, inputData[i])) * 0x7FFF;
                            }
                            socket.emit('voice_packet', { user: username, audio: buffer.buffer });
                        }
                    };
                })
                .catch(err => {
                    statusDiv.innerText = "Lỗi: Không tìm thấy hoặc chưa cấp quyền Micro!";
                    statusDiv.style.color = "#f44336";
                });
            }

            // Xử lý luồng âm thanh nhận được từ người chơi khác
            const activeSpeakers = {};
            socket.on('stream_out', (data) => {
                if (data.user === username) return;

                if (!activeSpeakers[data.user]) {
                    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
                    const gainNode = audioCtx.createGain();
                    gainNode.connect(audioCtx.destination);
                    activeSpeakers[data.user] = { ctx: audioCtx, gain: gainNode };
                }

                // Chuyển đổi ngược dữ liệu âm thanh để phát ra loa
                const int16Data = new Int16Array(data.audio);
                const float32Data = new Float32Array(int16Data.length);
                for (let i = 0; i < int16Data.length; i++) {
                    float32Data[i] = int16Data[i] / 0x7FFF;
                }

                const speaker = activeSpeakers[data.user];
                const audioBuffer = speaker.ctx.createBuffer(1, float32Data.length, speaker.ctx.sampleRate);
                audioBuffer.getChannelData(0).set(float32Data);

                const bufferSource = speaker.ctx.createBufferSource();
                bufferSource.buffer = audioBuffer;
                bufferSource.connect(speaker.gain);
                bufferSource.start();
            });

            // Lắng nghe lệnh điều chỉnh âm lượng từ Script game (Khoảng cách 3D hoặc Chung Nhóm)
            socket.on('volume_update', (data) => {
                if (activeSpeakers[data.targetUser]) {
                    // Áp dụng độ to nhỏ dựa vào khoảng cách trong Minecraft truyền về
                    activeSpeakers[data.targetUser].gain.gain.value = data.volume;
                }
            });
        </script>
    </body>
    </html>
    `);
});

// Quản lý truyền tải dữ liệu thời gian thực qua WebSockets
io.on('connection', (socket) => {
    // Nhận luồng mic từ một người chơi và đồng bộ sang những người còn lại
    socket.on('voice_packet', (data) => {
        socket.broadcast.emit('stream_out', {
            user: data.user,
            audio: data.audio
        });
    });

    // Nhận lệnh đồng bộ âm lượng xử lý từ Behavior Pack trong Minecraft gửi lên
    socket.on('game_sync', (data) => {
        io.emit('volume_update', {
            targetUser: data.p1, 
            volume
            
