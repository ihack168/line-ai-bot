require('dotenv').config();
const express = require('express');
const { 
  messagingApi: { MessagingApiClient, MessagingContentClient }, 
  middleware 
} = require('@line/bot-sdk');
const axios = require('axios');
const FormData = require('form-data');

const config = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
};

const app = express();

// LINE Webhook 路由
app.post('/callback', middleware(config), (req, res) => {
  Promise.all(req.body.events.map(handleEvent))
    .then((result) => res.json(result))
    .catch((err) => {
      console.error(err);
      res.status(500).end();
    });
});

// 初始化 Client
const client = new MessagingApiClient({
  channelAccessToken: config.channelAccessToken
});

const lineContentClient = new MessagingContentClient({
  channelAccessToken: config.channelAccessToken
});

async function handleEvent(event) {
  // 只處理文字與圖片訊息
  if (event.type !== 'message' || (event.message.type !== 'text' && event.message.type !== 'image')) {
    return Promise.resolve(null);
  }

  const userId = event.source.userId || "default_user";

  try {
    let files = [];

    // --- 圖片處理 ---
    if (event.message.type === 'image') {
      // 從 LINE 下載圖片內容
      const stream = await lineContentClient.getMessageContent(event.message.id);
      
      const chunks = [];
      for await (const chunk of stream) {
        chunks.push(chunk);
      }
      const buffer = Buffer.concat(chunks);

      // 上傳到 Dify
      const formData = new FormData();
      formData.append('file', buffer, { filename: 'image.jpg', contentType: 'image/jpeg' });
      formData.append('user', userId);

      const uploadRes = await axios.post(`${process.env.DIFY_API_URL}/files/upload`, formData, {
        headers: {
          ...formData.getHeaders(),
          'Authorization': `Bearer ${process.env.DIFY_API_KEY}`
        }
      });

      // 封裝成 Dify 要求的檔案格式
      files = [{
        type: "image",
        transfer_method: "local_file",
        upload_file_id: uploadRes.data.id
      }];
    }

    // --- 呼叫 Dify Chat API ---
    const response = await axios.post(`${process.env.DIFY_API_URL}/chat-messages`, {
      inputs: {},
      query: event.message.type === 'text' ? event.message.text : "請幫我分析這張圖片",
      response_mode: "blocking",
      user: userId,
      files: files
    }, {
      headers: {
        'Authorization': `Bearer ${process.env.DIFY_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    const aiAnswer = response.data.answer;

    // 回覆給 LINE 使用者
    return client.replyMessage({
      replyToken: event.replyToken,
      messages: [{ type: 'text', text: aiAnswer }]
    });

  } catch (error) {
    // 記錄詳細錯誤資訊到 Railway Log
    console.error('Error Details:', error.response ? JSON.stringify(error.response.data) : error.message);
    
    return client.replyMessage({
      replyToken: event.replyToken,
      messages: [{ type: 'text', text: 'AI 暫時無法處理您的請求，請確認 Dify 視覺設定已開啟。' }]
    });
  }
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`[系統訊息] 服務啟動！監聽端口：${PORT}`);
});