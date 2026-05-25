const express = require('express');
const app = express();
const server = require('http').createServer(app);
const io = require('socket.io')(server, { cors: { origin: "*" } });

app.get('/', (req, res) => {
    res.send(`
    <!DOCTYPE html>
    <html>
    <head>
        <title>mic - Voice Chat Web Client</title>
        <script src="/socket.io/socket.io.js"></script>
    </head>
    <body style="background:#222; color:#fff; font-family:sans-serif; text-align:center; padding-top:50px;">
        <h2>🎙️ Mod mic PE - Đang kết nối</h2>
        <p id="status">Đang kết nối Micro...</p>
        <input type="range" id="gateSlider" min="0" max="100" value="30">
        <label><br>Ngưỡng lọc tạp âm (Noise Gate)</label>

        <script>
            const socket = io();
            const urlParams = new URLSearchParams(window.location.search);
            const username = urlParams.get('user') || 'Gamer' + Math.floor(Math.random()*1000);
            
            navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
                document.getElementById('status').innerText = "Đã nhận mic thành công: " + username;
                
                const audioContext = new (window.AudioContext || window.webkitAudioContext)();
                const source = audioContext.createMediaStreamSource(stream);
                const analyser = audioContext.createAnalyser();
                source.connect(analyser);
                
                const bufferLength = analyser.frequencyBinCount;
                const dataArray = new Uint8Array(bufferLength);
                
                setInterval(() => {
                    analyser.getByteFrequencyData(dataArray);
                    let sum = 0;
                    for(let i=0; i<bufferLength; i++) sum += dataArray[i];
                    let averageVolume = sum / bufferLength;
                    
                    let limit = document.getElementById('gateSlider').value;
                    if (averageVolume > limit) {
                        socket.emit('voice_packet', { user: username, audio: "raw_stream_data" });
                    }
                }, 40); 
            }).catch(err => {
                document.getElementById('status').innerText = "Lỗi: Hãy cấp quyền truy cập Mic!";
            });
        </script>
    </body>
    </html>
    `);
});

io.on('connection', (socket) => {
    socket.on('voice_packet', (data) => {
        socket.broadcast.emit('stream_out', data);
    });
});

server.listen(3000, () => console.log('Voice Server mic running on port 3000'));
