require('dotenv').config();
const express = require('express');
const line = require('@line/bot-sdk');
const axios = require('axios');
const FormData = require('form-data');

const config = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
};

const app = express();

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

async function handleEvent(event) {
  if (event.type !== 'message' || (event.message.type !== 'text' && event.message.type !== 'image')) {
    return Promise.resolve(null);
  }

  const userId = event.source.userId || "default_user";

  try {
    let files = [];

    if (event.message.type === 'image') {
      // 直接用 axios 下載圖片，不用 MessagingContentClient
      const imageRes = await axios.get(
        `https://api-data.line.me/v2/bot/message/${event.message.id}/content`,
        {
          headers: { 'Authorization': `Bearer ${config.channelAccessToken}` },
          responseType: 'arraybuffer'
        }
      );
      const buffer = Buffer.from(imageRes.data);

      const formData = new FormData();
      formData.append('file', buffer, { filename: 'image.jpg', contentType: 'image/jpeg' });
      formData.append('user', userId);

      const uploadRes = await axios.post(`${process.env.DIFY_API_URL}/files/upload`, formData, {
        headers: {
          ...formData.getHeaders(),
          'Authorization': `Bearer ${process.env.DIFY_API_KEY}`
        }
      });

      files = [{
        type: "image",
        transfer_method: "local_file",
        upload_file_id: uploadRes.data.id
      }];
    }

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

    return client.replyMessage({
      replyToken: event.replyToken,
      messages: [{ type: 'text', text: aiAnswer }]
    });

  } catch (error) {
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