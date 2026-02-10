/**
 * Script to send an announcement to all connected users.
 * Run manually: npx ts-node scripts/sendAnnouncement.ts "你的公告内容"
 *
 * This script sends a POST request to the backend announcement endpoint,
 * which broadcasts the message to all connected WebSocket clients
 * and saves it to the database.
 */

import dotenv from 'dotenv';
import path from 'path';
import http from 'http';

// Load env from backend directory
dotenv.config({ path: path.join(__dirname, '../.env') });

const PORT = process.env.PORT || 4000;
const SECRET = process.env.ANNOUNCEMENT_SECRET || process.env.JWT_SECRET;

if (!SECRET) {
  console.error('Error: ANNOUNCEMENT_SECRET or JWT_SECRET is not defined in .env');
  process.exit(1);
}

const message = process.argv[2];

if (!message) {
  console.error('Usage: npx ts-node scripts/sendAnnouncement.ts "公告内容"');
  process.exit(1);
}

const postData = JSON.stringify({ message, secret: SECRET });

const options: http.RequestOptions = {
  hostname: 'localhost',
  port: Number(PORT),
  path: '/api/announcements/broadcast',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(postData),
  },
};

const req = http.request(options, (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    try {
      const json = JSON.parse(data);
      if (res.statusCode === 200) {
        console.log(`✅ 公告发送成功！已推送给 ${json.sentTo} 个在线用户。`);
      } else {
        console.error(`❌ 发送失败: ${json.error || data}`);
      }
    } catch {
      console.error(`❌ 响应解析失败: ${data}`);
    }
    process.exit(res.statusCode === 200 ? 0 : 1);
  });
});

req.on('error', (error) => {
  console.error(`❌ 连接失败，请确保服务器正在运行 (端口 ${PORT}):`, error.message);
  process.exit(1);
});

req.write(postData);
req.end();
