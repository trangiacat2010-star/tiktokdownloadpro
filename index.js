const functions = require('firebase-functions');
const axios = require('axios');
const admin = require('firebase-admin');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const os = require('os');
const fs = require('fs');

admin.initializeApp();

// ========== CORS CONFIG ==========
const corsConfig = {
  origin: [
    'https://tiktokdownloadpro.web.app',
    'https://tiktokdownloadpro.firebaseapp.com',
    'http://localhost:5000',
    'http://127.0.0.1:5000'
  ],
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  maxAge: 3600
};

// Helper: Xử lý CORS thủ công
function handleCORS(req, res) {
  const origin = req.headers.origin;
  
  // Kiểm tra origin có được phép không
  if (corsConfig.origin.includes(origin) || corsConfig.origin.includes('*')) {
    res.set('Access-Control-Allow-Origin', origin);
  } else {
    // Cho phép tất cả origin từ Firebase Hosting
    res.set('Access-Control-Allow-Origin', origin || '*');
  }
  
  res.set('Access-Control-Allow-Methods', corsConfig.methods.join(', '));
  res.set('Access-Control-Allow-Headers', corsConfig.allowedHeaders.join(', '));
  res.set('Access-Control-Max-Age', corsConfig.maxAge.toString());
  res.set('Access-Control-Allow-Credentials', 'true');
  
  // Xử lý preflight request
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return true; // Đã xử lý xong
  }
  return false; // Tiếp tục xử lý request
}
// =================================

async function getTikTokInfoFromAPI(url) {
  try {
    const { data } = await axios.get('https://tikwm.com/api/', {
      params: { url },
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7',
        'Referer': 'https://tikwm.com/'
      },
      timeout: 15000
    });

    if (data.code !== 0) {
      throw new Error(data.msg || 'Không thể lấy thông tin video');
    }

    const v = data.data;
    const author = v.author || {};

    return {
      title: v.title || '',
      author_name: author.nickname || 'Unknown',
      author_unique_id: author.unique_id || 'unknown',
      avatar: author.avatar || '',
      duration: v.duration || 0,
      views: v.play_count || 0,
      likes: v.digg_count || 0,
      comments: v.comment_count || 0,
      shares: v.share_count || 0,
      music: (v.music_info && v.music_info.title) || v.music || '',
      video_url: v.hdplay || v.play || v.wmplay || '',
      images: v.images || [],
      is_image_post: Boolean(v.images?.length && !v.hdplay && !v.play && !v.wmplay)
    };
  } catch (error) {
    console.error('Error fetching TikTok info:', error.message);
    throw error;
  }
}

async function downloadVideoFile(videoUrl, filename) {
  const tempPath = path.join(os.tmpdir(), filename);
  
  const response = await axios({
    method: 'GET',
    url: videoUrl,
    responseType: 'stream',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Referer': 'https://www.tiktok.com/'
    },
    timeout: 60000
  });

  const writer = fs.createWriteStream(tempPath);
  response.data.pipe(writer);

  return new Promise((resolve, reject) => {
    writer.on('finish', () => resolve(tempPath));
    writer.on('error', reject);
  });
}

async function uploadToStorage(filePath, filename) {
  const bucket = admin.storage().bucket();
  const destination = `tiktok-videos/${filename}`;
  
  await bucket.upload(filePath, {
    destination: destination,
    metadata: {
      contentType: 'video/mp4',
      metadata: {
        uploadedAt: Date.now().toString()
      }
    }
  });

  const [url] = await bucket.file(destination).getSignedUrl({
    action: 'read',
    expires: Date.now() + 3600000 // 1 giờ
  });

  // Xóa file tạm
  fs.unlinkSync(filePath);

  // Schedule delete sau 1 giờ (tùy chọn)
  setTimeout(async () => {
    try {
      await bucket.file(destination).delete();
      console.log(`Đã xóa file hết hạn: ${filename}`);
    } catch (e) {
      console.log('Không thể xóa file:', e.message);
    }
  }, 3600000);

  return url;
}

// ==================== CLOUD FUNCTIONS ====================

/**
 * GET /getTikTokInfo
 * Lấy thông tin video TikTok
 */
exports.getTikTokInfo = functions.https.onRequest((req, res) => {
  // Xử lý CORS trước
  const isPreflight = handleCORS(req, res);
  if (isPreflight) return;

  // Xử lý request chính
  (async () => {
    try {
      // Chỉ chấp nhận POST
      if (req.method !== 'POST') {
        return res.status(405).json({ 
          success: false, 
          error: 'Method not allowed. Use POST.' 
        });
      }

      const { url } = req.body;

      if (!url) {
        return res.status(400).json({ 
          success: false, 
          error: 'Vui lòng nhập link video' 
        });
      }

      if (!url.includes('tiktok.com')) {
        return res.status(400).json({ 
          success: false, 
          error: 'Link không phải từ TikTok. Vui lòng kiểm tra lại!' 
        });
      }

      console.log('Đang lấy thông tin:', url);
      const info = await getTikTokInfoFromAPI(url);

      if (info.is_image_post) {
        return res.status(400).json({
          success: false,
          error: '⚠️ Link này là bài đăng ảnh (slideshow). Hiện tại chỉ hỗ trợ tải video.'
        });
      }

      if (!info.video_url) {
        return res.status(400).json({
          success: false,
          error: 'Không tìm thấy video từ link này. Vui lòng thử link khác.'
        });
      }

      // Không trả về video_url cho client (bảo mật)
      const { video_url, images, is_image_post, ...safeInfo } = info;

      return res.status(200).json({
        success: true,
        data: safeInfo
      });

    } catch (error) {
      console.error('Lỗi getTikTokInfo:', error);
      return res.status(500).json({
        success: false,
        error: error.message || 'Có lỗi xảy ra, vui lòng thử lại sau.'
      });
    }
  })();
});

/**
 * POST /downloadTikTok
 * Tải video TikTok và trả về link download
 */
exports.downloadTikTok = functions.https.onRequest((req, res) => {
  // Xử lý CORS trước
  const isPreflight = handleCORS(req, res);
  if (isPreflight) return;

  // Xử lý request chính
  (async () => {
    try {
      // Chỉ chấp nhận POST
      if (req.method !== 'POST') {
        return res.status(405).json({ 
          success: false, 
          error: 'Method not allowed. Use POST.' 
        });
      }

      const { url } = req.body;

      if (!url) {
        return res.status(400).json({ 
          success: false, 
          error: 'Thiếu link video' 
        });
      }

      console.log('Đang tải video:', url);
      
      // Lấy thông tin video
      const info = await getTikTokInfoFromAPI(url);

      if (info.is_image_post || !info.video_url) {
        return res.status(400).json({
          success: false,
          error: 'Không thể tải video từ link này. Có thể đây là bài đăng ảnh hoặc link không hợp lệ.'
        });
      }

      // Tạo tên file an toàn
      const safeAuthor = info.author_unique_id.replace(/[^a-zA-Z0-9_]/g, '_').substring(0, 30);
      const uniqueId = uuidv4().slice(0, 8);
      const filename = `${safeAuthor}_${uniqueId}.mp4`;

      console.log('Đang tải video về server...');
      const tempPath = await downloadVideoFile(info.video_url, filename);
      
      console.log('Đang upload lên Storage...');
      const downloadUrl = await uploadToStorage(tempPath, filename);

      console.log('Hoàn tất! Download URL:', downloadUrl);

      return res.status(200).json({
        success: true,
        download_url: downloadUrl,
        filename: filename,
        message: 'Video đã sẵn sàng để tải xuống!'
      });

    } catch (error) {
      console.error('Lỗi downloadTikTok:', error);
      return res.status(500).json({
        success: false,
        error: error.message || 'Có lỗi khi tải video, vui lòng thử lại.'
      });
    }
  })();
});
