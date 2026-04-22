require('dotenv').config();
const express = require('express');
const line = require('@line/bot-sdk');
const axios = require('axios');
const FormData = require('form-data'); // 必須處理圖片上傳格式

const config = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
};

const app = express();

// LINE Webhook 路由
app.post('/callback', line.middleware(config), (req, res) => {
  Promise.all(req.body.events.map(handleEvent))
    .then((result) => res.json(result))
    .catch((err) => {
      console.error(err);
      res.status(500).end();
    });
});

const client = new line.messagingApi.MessagingApiClient({
  channelAccessToken: config.channelAccessToken
});

// 這是專門用來下載 LINE 圖片的 Client (舊版 SDK 在下載檔案上較直觀)
const lineContentClient = new line.messagingApi.MessagingApiContentClient({
  channelAccessToken: config.channelAccessToken
});

async function handleEvent(event) {
  // 只處理文字和圖片訊息
  if (event.type !== 'message' || (event.message.type !== 'text' && event.message.type !== 'image')) {
    return Promise.resolve(null);
  }

  const userId = event.source.userId || "default_user";

  try {
    let files = [];

    // --- 圖片處理邏輯 ---
    if (event.message.type === 'image') {
      // 1. 從 LINE 下載圖片二進位檔
      const stream = await lineContentClient.getMessageContent(event.message.id);
      
      // 將 Stream 轉為 Buffer 以便上傳
      const chunks = [];
      for await (const chunk of stream) {
        chunks.push(chunk);
      }
      const buffer = Buffer.concat(chunks);

      // 2. 將圖片上傳到 Dify
      const formData = new FormData();
      formData.append('file', buffer, { filename: 'image.jpg', contentType: 'image/jpeg' });
      formData.append('user', userId);

      const uploadRes = await axios.post(`${process.env.DIFY_API_URL}/files/upload`, formData, {
        headers: {
          ...formData.getHeaders(),
          'Authorization': `Bearer ${process.env.DIFY_API_KEY}`
        }
      });

      // 3. 取得 Dify 的檔案 ID
      files = [{
        type: "image",
        transfer_method: "local_file",
        upload_file_id: uploadRes.data.id
      }];
    }

    // --- 呼叫 Dify Chat API ---
    const response = await axios.post(`${process.env.DIFY_API_URL}/chat-messages`, {
      inputs: {},
      query: event.message.type === 'text' ? event.message.text : "這張圖片是什麼？", // 圖片訊息的預設提問
      response_mode: "blocking",
      user: userId,
      files: files // 如果有圖片，會帶入檔案 ID
    }, {
      headers: {
        'Authorization': `Bearer ${process.env.DIFY_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    const aiAnswer = response.data.answer;

    return client.replyMessage({
      replyToken: event.replyToken,
      messages: [{ type: 'text', text: aiAnswer }]
    });

  } catch (error) {
    console.error('Error Details:', error.response ? error.response.data : error.message);
    return client.replyMessage({
      replyToken: event.replyToken,
      messages: [{ type: 'text', text: '系統忙碌中，請稍後再試。' }]
    });
  }
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`服務啟動成功！正在監聽端口：${PORT}`);
});