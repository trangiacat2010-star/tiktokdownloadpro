const express = require('express');
const multer = require('multer');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const app = express();
const PORT = process.env.PORT || 3000;

// Cấu hình CORS
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Tạo thư mục uploads nếu chưa có
const uploadDir = './uploads';
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
}

// Cấu hình multer để nhận file
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        cb(null, 'index.html');
    }
});

const upload = multer({ 
    storage: storage,
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'text/html' || file.originalname.endsWith('.html')) {
            cb(null, true);
        } else {
            cb(new Error('Chỉ chấp nhận file HTML'), false);
        }
    }
});

// Trang chủ
app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Firebase Deploy Tool</title>
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <style>
                body { font-family: Arial; padding: 20px; max-width: 600px; margin: 0 auto; background: #f5f5f5; }
                .container { background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
                h1 { color: #333; }
                input[type="file"] { width: 100%; padding: 10px; margin: 10px 0; border: 2px dashed #ddd; border-radius: 5px; }
                button { width: 100%; padding: 12px; background: #4CAF50; color: white; border: none; border-radius: 5px; font-size: 16px; cursor: pointer; }
                button:hover { background: #45a049; }
                #status { margin-top: 20px; padding: 10px; border-radius: 5px; }
                .success { background: #d4edda; color: #155724; }
                .error { background: #f8d7da; color: #721c24; }
                .info { background: #d1ecf1; color: #0c5460; }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>🚀 Deploy HTML lên Firebase</h1>
                <p>Chọn file HTML và deploy lên <strong>admin-cattran.web.app</strong></p>
                <form id="uploadForm">
                    <input type="file" id="fileInput" accept=".html" required />
                    <button type="submit">📤 Upload & Deploy</button>
                </form>
                <div id="status"></div>
                <div style="margin-top: 20px; font-size: 12px; color: #999;">
                    <p>Status: <span id="serverStatus">🟢 Online</span></p>
                    <p>Dự án: admin-cattran</p>
                </div>
            </div>
            
            <script>
                document.getElementById('uploadForm').onsubmit = async (e) => {
                    e.preventDefault();
                    const file = document.getElementById('fileInput').files[0];
                    if (!file) {
                        alert('Chọn file HTML!');
                        return;
                    }
                    
                    const status = document.getElementById('status');
                    status.className = 'info';
                    status.textContent = '⏳ Đang upload...';
                    
                    const formData = new FormData();
                    formData.append('file', file);
                    
                    try {
                        const response = await fetch('/upload', {
                            method: 'POST',
                            body: formData
                        });
                        const result = await response.json();
                        if (result.success) {
                            status.className = 'success';
                            status.textContent = '✅ ' + result.message;
                        } else {
                            status.className = 'error';
                            status.textContent = '❌ ' + result.message;
                        }
                    } catch (error) {
                        status.className = 'error';
                        status.textContent = '❌ Lỗi: ' + error.message;
                    }
                };
            </script>
        </body>
        </html>
    `);
});

// API upload file
app.post('/upload', upload.single('file'), (req, res) => {
    try {
        console.log('📱 Nhận file từ client:', req.file ? req.file.originalname : 'No file');
        
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'Không nhận được file'
            });
        }
        
        // Sao chép file vào thư mục gốc
        const sourcePath = path.join(__dirname, 'uploads', 'index.html');
        const destPath = path.join(__dirname, 'index.html');
        
        if (fs.existsSync(sourcePath)) {
            fs.copyFileSync(sourcePath, destPath);
            console.log('✅ Đã lưu file index.html');
            
            // Trả về response ngay lập tức
            res.json({
                success: true,
                message: 'Upload thành công! Đang deploy...'
            });
            
            // Deploy ngầm
            deployFirebase();
        } else {
            throw new Error('Không tìm thấy file upload');
        }
    } catch (error) {
        console.error('❌ Lỗi:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// API deploy thủ công
app.post('/deploy', (req, res) => {
    res.json({ success: true, message: 'Bắt đầu deploy...' });
    deployFirebase();
});

// API kiểm tra status
app.get('/status', (req, res) => {
    res.json({
        status: 'online',
        project: 'admin-cattran',
        url: 'https://admin-cattran.web.app'
    });
});

// Hàm deploy lên Firebase
function deployFirebase() {
    console.log('🚀 Đang deploy lên Firebase Hosting...');
    
    exec('npm run deploy', (error, stdout, stderr) => {
        if (error) {
            console.error(`❌ Lỗi deploy: ${error.message}`);
            return;
        }
        if (stderr) {
            console.error(`⚠️ Warning: ${stderr}`);
        }
        console.log(`✅ Deploy thành công!\n${stdout}`);
        console.log('🌐 Truy cập: https://admin-cattran.web.app');
    });
}

// Khởi động server
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🔥 Server đang chạy tại: http://localhost:${PORT}`);
    console.log(`📱 Gửi file HTML từ điện thoại tới: http://YOUR_IP:${PORT}/upload`);
    console.log(`✅ Deploy thủ công: npm run deploy`);
});
