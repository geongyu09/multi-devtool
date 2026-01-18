const WebSocket = require("ws");
const express = require("express");
const path = require("path");
const app = express();

// 등록된 페이지들 저장
const registeredPages = new Map();

// WebSocket 서버 생성
const wss = new WebSocket.Server({ noServer: true });

// CORS 설정
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.header("Access-Control-Allow-Headers", "*");
  next();
});

// 정적 파일 제공 (클라이언트 스크립트)
app.use(express.static("public"));

// CDP 엔드포인트: 디버깅 가능한 타겟 목록
app.get("/json", (req, res) => {
  const targets = Array.from(registeredPages.values()).map((page) => ({
    description: page.userAgent,
    id: page.id,
    title: page.title,
    type: "page",
    url: page.url,
    webSocketDebuggerUrl: `ws://localhost:3002/devtools/page/${page.id}`,
  }));

  res.json(targets);
});

// CDP 버전 정보
app.get("/json/version", (req, res) => {
  res.json({
    Browser: "RemoteDevTools/1.0",
    "Protocol-Version": "1.3",
    "User-Agent": "Custom Browser",
    "V8-Version": "8.0.0",
    "WebKit-Version": "537.36",
  });
});

// 등록된 페이지 목록 조회 API
app.get("/api/pages", (req, res) => {
  const pages = Array.from(registeredPages.values()).map((page) => ({
    id: page.id,
    url: page.url,
    title: page.title,
    userAgent: page.userAgent,
    registeredAt: page.registeredAt,
  }));

  res.json(pages);
});

const server = app.listen(3002, () => {
  console.log("CDP 프록시 서버 실행 중: http://localhost:3002");
  console.log("Chrome DevTools: chrome://inspect");
  console.log("Configure에서 localhost:3002 추가 필요");
});

// WebSocket 업그레이드 처리
server.on("upgrade", (request, socket, head) => {
  const pathname = new URL(request.url, "http://localhost").pathname;

  if (pathname.startsWith("/devtools/page/")) {
    // Chrome DevTools 연결
    const pageId = pathname.split("/").pop();
    wss.handleUpgrade(request, socket, head, (ws) => {
      handleDevToolsConnection(ws, pageId);
    });
  } else {
    // 웹페이지 등록 연결
    wss.handleUpgrade(request, socket, head, (ws) => {
      handlePageRegistration(ws);
    });
  }
});

// DevTools와 웹페이지 간 메시지 중계
function handleDevToolsConnection(devtoolsWs, pageId) {
  const page = registeredPages.get(pageId);

  if (!page) {
    console.log(`페이지를 찾을 수 없음: ${pageId}`);
    devtoolsWs.close();
    return;
  }

  console.log(`✓ DevTools가 페이지에 연결됨: ${page.title}`);

  // DevTools → 웹페이지
  devtoolsWs.on("message", (data) => {
    // Buffer를 문자열로 변환
    const message = data.toString('utf-8');
    console.log(`[DevTools → Page] ${message.substring(0, 200)}`);
    if (page.connection.readyState === WebSocket.OPEN) {
      page.connection.send(message);
    }
  });

  // 웹페이지 → DevTools
  const pageMessageHandler = (data) => {
    // Buffer를 문자열로 변환
    const message = data.toString('utf-8');
    console.log(`[Page → DevTools] ${message.substring(0, 200)}`);
    if (devtoolsWs.readyState === WebSocket.OPEN) {
      devtoolsWs.send(message);
    }
  };

  page.connection.on("message", pageMessageHandler);

  devtoolsWs.on("close", () => {
    console.log(`✗ DevTools 연결 종료: ${pageId}`);
    page.connection.off("message", pageMessageHandler);
  });
}

// 웹페이지 등록 처리
function handlePageRegistration(ws) {
  let pageId = null;

  ws.on("message", (data) => {
    const msg = JSON.parse(data);

    if (msg.type === "register") {
      pageId = Date.now().toString();
      registeredPages.set(pageId, {
        id: pageId,
        url: msg.url,
        title: msg.title,
        userAgent: msg.userAgent,
        connection: ws,
        registeredAt: new Date(),
      });

      console.log(`✓ 페이지 등록: ${msg.title} (${pageId})`);

      ws.send(
        JSON.stringify({
          type: "registered",
          id: pageId,
        }),
      );
    }

    if (msg.type === "ping") {
      // 연결 유지 응답
      ws.send(JSON.stringify({ type: "pong" }));
    }
  });

  ws.on("close", () => {
    if (pageId) {
      registeredPages.delete(pageId);
      console.log(`✗ 페이지 연결 종료: ${pageId}`);
    }
  });
}
