require('dotenv').config();
const express = require('express');
const line = require('@line/bot-sdk');
const fs = require('fs');

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

const client = new line.Client(config);

function handleEvent(event) {
  if (event.type !== 'message' || event.message.type !== 'text') {
    return Promise.resolve(null);
  }

  // 這邊之後會寫：讀取 faq.json -> 問 Gemini -> 回覆 LINE
  const userMessage = event.message.text;
  
  return client.replyMessage(event.replyToken, {
    type: 'text',
    text: `你說了：${userMessage}（AI 串接中...）`
  });
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`伺服器正在運行，端口：${PORT}`);
});